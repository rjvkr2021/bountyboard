use std::collections::BTreeMap;

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    AccountId, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, env, near,
};

pub mod access;
pub mod dao;
pub mod errors;
pub mod events;
pub mod state;
pub mod types;
pub mod validation;

use crate::dao::{
    Action, ActionCall, Policy, ProposalInput, ProposalKind, ProposalOutput, ProposalStatus,
};
use crate::errors::ContractError;
use crate::state::StorageKey;
use crate::types::{
    Approval, ApprovalSource, BoardConfig, BootstrapState, BudgetView, Candidate, CompletionKind,
    CouncilRequest, DAY_SECS, DEFAULT_DAILY_CAP_YOCTO, DaoParams, GAS_FOR_PAYOUT,
    GAS_FOR_PAYOUT_CALLBACK, Issue, IssueId, IssueKind, IssueStatus, MAX_CLAIMANTS,
    MaintainerRecord, PayoutId, PayoutRecord, PendingPayout, PrivateRef, REPO_ID, Repo, RepoId,
    Reputation, S3_AUTO_APPROVE_MAX_YOCTO, S3_AUTO_MIN_COMPLETED, Tier,
};

#[near_sdk::ext_contract(ext_self)]
pub trait Callbacks {
    fn on_payout_proposal_created(&mut self, issue_id: IssueId);
    fn on_payout_vote_result(&mut self, issue_id: IssueId);
    fn on_retry_payout_proposal(&mut self, issue_id: IssueId);
    fn on_sync_payout_proposal(&mut self, issue_id: IssueId);
    fn on_finalize_payout_proposal(&mut self, issue_id: IssueId);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BountyBoard {
    pub dao: AccountId,
    pub repos: IterableMap<RepoId, Repo>,
    pub issues: IterableMap<IssueId, Issue>,
    pub issue_by_number: LookupMap<(RepoId, u64), IssueId>,
    pub private_refs: LookupMap<PrivateRef, IssueId>,
    pub identities: LookupMap<String, AccountId>,
    pub account_identities: LookupMap<AccountId, String>,
    pub reputation: IterableMap<AccountId, Reputation>,
    pub payouts: IterableMap<PayoutId, PayoutRecord>,
    pub candidates: IterableMap<AccountId, Candidate>,
    pub council_requests: IterableMap<AccountId, CouncilRequest>,
    pub daily_spend: LookupMap<(u64, AccountId), u128>,
    pub dao_params: DaoParams,
    pub bootstrap_until_maintainers: u32,
    pub maintainer_challenge_secs: u64,
    pub council_promotion_min_tenure_secs: u64,
    pub council_promotion_delay_secs: u64,
    pub council_promotion_min_approvals: u32,
    pub council_role_name: String,
    pub next_issue_id: u64,
    pub next_payout_id: u64,
}

#[near]
impl BountyBoard {
    #[init]
    pub fn new(dao: AccountId, config: Option<BoardConfig>) -> Self {
        let config = config.unwrap_or_default();
        Self {
            dao,
            repos: IterableMap::new(StorageKey::Repos),
            issues: IterableMap::new(StorageKey::Issues),
            issue_by_number: LookupMap::new(StorageKey::IssueByNumber),
            private_refs: LookupMap::new(StorageKey::PrivateRefs),
            identities: LookupMap::new(StorageKey::Identities),
            account_identities: LookupMap::new(StorageKey::AccountIdentities),
            reputation: IterableMap::new(StorageKey::Reputation),
            payouts: IterableMap::new(StorageKey::Payouts),
            candidates: IterableMap::new(StorageKey::Candidates),
            council_requests: IterableMap::new(StorageKey::CouncilRequests),
            daily_spend: LookupMap::new(StorageKey::DailySpend),
            dao_params: DaoParams::default(),
            bootstrap_until_maintainers: config.bootstrap_until_maintainers,
            maintainer_challenge_secs: config.maintainer_challenge_secs,
            council_promotion_min_tenure_secs: config.council_promotion_min_tenure_secs,
            council_promotion_delay_secs: config.council_promotion_delay_secs,
            council_promotion_min_approvals: config.council_promotion_min_approvals,
            council_role_name: config.council_role_name,
            next_issue_id: 0,
            next_payout_id: 0,
        }
    }

    pub fn get_dao(&self) -> AccountId {
        self.dao.clone()
    }

    #[handle_result]
    pub fn create_bounty(
        &mut self,
        issue_number: u64,
        tier: Tier,
        amount: U128,
        contributor: Option<AccountId>,
    ) -> Result<IssueId, ContractError> {
        let creator = env::predecessor_account_id();
        let repo = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        access::assert_maintainer(repo, &creator)?;
        validation::validate_tier(tier)?;
        validation::validate_amount(amount.0)?;

        if self.issue_by_number.contains_key(&(REPO_ID, issue_number)) {
            return Err(ContractError::DuplicateIssueNumber);
        }
        access::assert_repo_open(repo)?;
        validation::assert_budget_available(repo, amount.0)?;

        let now = env::block_timestamp();
        let day = now / (DAY_SECS * 1_000_000_000);
        let daily_key = (day, creator.clone());
        let mut spent = 0;
        if matches!(tier, Tier::S2 | Tier::S3) {
            spent = self.daily_spend.get(&daily_key).copied().unwrap_or(0);
            validation::assert_daily_cap(repo, spent, amount.0)?;
        }

        let auto_s3 = tier.is_s3()
            && amount.0 <= S3_AUTO_APPROVE_MAX_YOCTO
            && contributor.as_ref().is_some_and(|account| {
                account != &creator
                    && self
                        .reputation
                        .get(account)
                        .is_some_and(|record| record.completed >= S3_AUTO_MIN_COMPLETED)
            });
        let (status, approvals) = if auto_s3 {
            let account = contributor.clone().expect("contributor checked");
            (
                IssueStatus::Approved,
                vec![Approval {
                    approver: account,
                    source: ApprovalSource::AutoS3,
                    at: now,
                }],
            )
        } else {
            (IssueStatus::PendingApproval, Vec::new())
        };

        let issue_id = self.next_issue_id;
        self.next_issue_id += 1;
        let mut issue = Issue {
            repo_id: REPO_ID,
            kind: IssueKind::PublicIssue,
            issue_number: Some(issue_number),
            private_ref: None,
            tier,
            amount,
            status,
            creator: creator.clone(),
            claimants: Vec::new(),
            approvals,
            intended_contributor: contributor.clone(),
            merge_proof: None,
            security: None,
            s0: None,
            payout_id: None,
            payout_proposal_id: None,
            pending_payout: None,
            blocked_reason: None,
            cancelled_by: None,
            created_at: now,
        };
        let repo = self
            .repos
            .get_mut(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        repo.committed = U128(
            repo.committed
                .0
                .checked_add(amount.0)
                .ok_or(ContractError::BudgetExceeded)?,
        );
        if matches!(tier, Tier::S2 | Tier::S3) {
            let total = spent
                .checked_add(amount.0)
                .ok_or(ContractError::DailyCapExceeded)?;
            self.daily_spend.insert(daily_key, total);
        }

        let repo_view = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        self.maybe_escalate(repo_view, &mut issue);
        let status = issue.status;
        self.issues.insert(issue_id, issue);
        self.issue_by_number
            .insert((REPO_ID, issue_number), issue_id);

        events::bounty_created(
            issue_id,
            issue_number,
            tier,
            amount.0,
            creator,
            contributor,
            status,
        );

        Ok(issue_id)
    }

    fn is_conflicted(&self, issue: &Issue, maintainer: &AccountId) -> bool {
        if &issue.creator == maintainer || issue.claimants.contains(maintainer) {
            return true;
        }
        if let Some(proof) = &issue.merge_proof
            && self
                .identities
                .get(&proof.pr_author)
                .is_some_and(|account| account == maintainer)
        {
            return true;
        }
        if let Some(security) = &issue.security
            && self
                .identities
                .get(&security.researcher_github)
                .is_some_and(|account| account == maintainer)
        {
            return true;
        }
        false
    }

    fn unconflicted_approvals(&self, issue: &Issue) -> u32 {
        issue
            .approvals
            .iter()
            .filter(|approval| {
                approval.source == ApprovalSource::Maintainer
                    && !self.is_conflicted(issue, &approval.approver)
            })
            .count() as u32
    }

    fn maybe_escalate(&self, repo: &Repo, issue: &mut Issue) {
        if issue.status != IssueStatus::PendingApproval || !repo.bootstrap_ended {
            return;
        }
        let required = issue.tier.required_maintainer_approvals();
        let current = self.unconflicted_approvals(issue);
        let potential = repo
            .maintainers
            .keys()
            .filter(|account| {
                !self.is_conflicted(issue, account)
                    && !issue
                        .approvals
                        .iter()
                        .any(|approval| &approval.approver == *account)
            })
            .count() as u32;
        if current + potential < required {
            issue.status = IssueStatus::Escalated;
        }
    }

    #[handle_result]
    pub fn approve(&mut self, issue_id: IssueId) -> Result<(), ContractError> {
        let caller = env::predecessor_account_id();
        let repo = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        access::assert_maintainer(repo, &caller)?;

        let mut issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?
            .clone();
        if issue.status != IssueStatus::PendingApproval {
            return Err(ContractError::InvalidState);
        }
        if issue.approvals.iter().any(|item| item.approver == caller)
            || self.is_conflicted(&issue, &caller)
        {
            return Err(ContractError::Conflict);
        }

        issue.approvals.push(Approval {
            approver: caller.clone(),
            source: ApprovalSource::Maintainer,
            at: env::block_timestamp(),
        });
        if self.unconflicted_approvals(&issue) >= issue.tier.required_maintainer_approvals() {
            issue.status = approved_status(&issue);
        }
        self.maybe_escalate(repo, &mut issue);
        let status = issue.status;
        self.issues.insert(issue_id, issue);
        events::bounty_approved(issue_id, caller, ApprovalSource::Maintainer, status);

        Ok(())
    }

    #[handle_result]
    pub fn council_approve(&mut self, issue_id: IssueId) -> Result<(), ContractError> {
        access::assert_dao(self)?;
        let mut issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?
            .clone();
        if issue.status != IssueStatus::Escalated {
            return Err(ContractError::InvalidState);
        }

        let status = approved_status(&issue);
        issue.approvals.push(Approval {
            approver: env::predecessor_account_id(),
            source: ApprovalSource::Council,
            at: env::block_timestamp(),
        });
        issue.status = status;
        self.issues.insert(issue_id, issue);
        events::bounty_approved(
            issue_id,
            env::predecessor_account_id(),
            ApprovalSource::Council,
            status,
        );

        Ok(())
    }

    #[handle_result]
    pub fn bootstrap_approve(&mut self, issue_id: IssueId) -> Result<(), ContractError> {
        access::assert_dao(self)?;
        let repo = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        let maintainers_len = repo.maintainers.len() as u32;
        if repo.bootstrap_ended || maintainers_len >= self.bootstrap_until_maintainers {
            return Err(ContractError::InvalidState);
        }

        let mut issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?
            .clone();
        if issue.tier.is_s0()
            || !matches!(
                issue.status,
                IssueStatus::PendingApproval | IssueStatus::Escalated
            )
        {
            return Err(ContractError::InvalidState);
        }

        let status = approved_status(&issue);
        issue.approvals.push(Approval {
            approver: env::predecessor_account_id(),
            source: ApprovalSource::BootstrapCouncil,
            at: env::block_timestamp(),
        });
        issue.status = status;
        self.issues.insert(issue_id, issue);
        events::bounty_approved(
            issue_id,
            env::predecessor_account_id(),
            ApprovalSource::BootstrapCouncil,
            status,
        );

        Ok(())
    }

    #[handle_result]
    pub fn mark_spam(&mut self, issue_id: IssueId) -> Result<(), ContractError> {
        let caller = env::predecessor_account_id();
        let repo = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        access::assert_maintainer(repo, &caller)?;

        let mut issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?
            .clone();
        if issue.kind != IssueKind::PublicIssue || issue.tier.is_s0() {
            return Err(ContractError::InvalidState);
        }
        if !matches!(
            issue.status,
            IssueStatus::PendingApproval | IssueStatus::Approved | IssueStatus::Escalated
        ) {
            return Err(ContractError::InvalidState);
        }

        let released = issue.amount.0;
        issue.status = IssueStatus::Cancelled;
        issue.cancelled_by = Some(caller.clone());

        let repo = self
            .repos
            .get_mut(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        repo.committed = U128(
            repo.committed
                .0
                .checked_sub(released)
                .ok_or(ContractError::StorageError)?,
        );

        self.issues.insert(issue_id, issue);
        events::spam_marked(issue_id, caller, released);

        Ok(())
    }

    #[handle_result]
    pub fn claim(&mut self, issue_id: IssueId) -> Result<(), ContractError> {
        let caller = env::predecessor_account_id();
        let issue = self
            .issues
            .get_mut(&issue_id)
            .ok_or(ContractError::IssueNotFound)?;

        if issue.kind != IssueKind::PublicIssue {
            return Err(ContractError::PrivateSecurityNoClaims);
        }
        if matches!(issue.status, IssueStatus::Paid | IssueStatus::Cancelled) {
            return Err(ContractError::InvalidState);
        }
        if issue.claimants.contains(&caller) {
            return Ok(());
        }
        if issue.claimants.len() >= MAX_CLAIMANTS {
            return Err(ContractError::ClaimantLimitReached);
        }

        issue.claimants.push(caller.clone());
        events::bounty_claimed(issue_id, caller);
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn request_payout(
        &mut self,
        issue_id: IssueId,
    ) -> Result<PromiseOrValue<()>, ContractError> {
        let mut issue = self
            .issues
            .get(&issue_id)
            .cloned()
            .ok_or(ContractError::IssueNotFound)?;

        if issue.tier.is_s0() {
            return Err(ContractError::InvalidState);
        }
        if issue.kind == IssueKind::PrivateSecurity && issue.security.is_none() {
            return Err(ContractError::SecurityNotDisclosed);
        }
        if issue.status != IssueStatus::Merged {
            return Err(ContractError::InvalidState);
        }

        let recipient = self.resolve_recipient(&issue)?;

        if issue.creator == recipient
            || issue.approvals.iter().any(|approval| {
                approval.source == ApprovalSource::Maintainer && approval.approver == recipient
            })
        {
            issue.status = IssueStatus::Escalated;
            issue.blocked_reason = Some("final recipient conflicts with an approver".to_string());
            let reason = issue.blocked_reason.clone().unwrap_or_default();
            self.issues.insert(issue_id, issue);
            events::payout_request_failed(issue_id, reason);
            return Ok(PromiseOrValue::Value(()));
        }

        if !self.approvals_sufficient(&issue) {
            return Err(ContractError::InsufficientApprovals);
        }

        if issue
            .approvals
            .iter()
            .any(|approval| approval.source == ApprovalSource::AutoS3)
            && issue.intended_contributor.as_ref() != Some(&recipient)
        {
            issue.status = IssueStatus::Escalated;
            issue.blocked_reason =
                Some("PR author does not match intended contributor".to_string());
            let reason = issue.blocked_reason.clone().unwrap_or_default();
            self.issues.insert(issue_id, issue);
            events::payout_request_failed(issue_id, reason);
            return Ok(PromiseOrValue::Value(()));
        }

        let repo = self
            .repos
            .get(&REPO_ID)
            .ok_or(ContractError::RepoNotFound)?;
        if repo.committed.0 < issue.amount.0 {
            return Err(ContractError::BudgetExceeded);
        }

        let bond = self.dao_params.proposal_bond.0;
        if env::attached_deposit().as_yoctonear() < bond {
            return Err(ContractError::InsufficientBond);
        }

        let proof_kind = match issue.kind {
            IssueKind::PublicIssue => CompletionKind::PullRequest,
            IssueKind::PrivateSecurity => CompletionKind::AdvisoryPublication,
        };
        let proposal_kind = payout_proposal_kind(issue_id, issue.amount.0);
        let proposal = ProposalInput {
            description: format!("BountyBoard payout issue {issue_id}"),
            kind: proposal_kind.clone(),
        };

        issue.status = IssueStatus::PayoutRequested;
        issue.blocked_reason = None;
        issue.payout_proposal_id = None;
        issue.pending_payout = Some(PendingPayout {
            issue_id,
            recipient,
            amount: issue.amount,
            proof_kind,
            proposal_id: None,
            proposal_kind,
        });
        self.issues.insert(issue_id, issue);

        let promise = dao::ext_dao::ext(self.dao.clone())
            .with_attached_deposit(NearToken::from_yoctonear(bond))
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_ADD_PROPOSAL))
            .add_proposal(proposal)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_gas(GAS_FOR_PAYOUT_CALLBACK))
                    .on_payout_proposal_created(issue_id),
            );

        Ok(PromiseOrValue::Promise(promise))
    }

    #[private]
    pub fn on_payout_proposal_created(
        &mut self,
        issue_id: IssueId,
        #[callback_result] result: Result<u64, PromiseError>,
    ) -> PromiseOrValue<()> {
        let mut issue = match self.issues.get(&issue_id).cloned() {
            Some(issue) => issue,
            None => return PromiseOrValue::Value(()),
        };

        match result {
            Ok(proposal_id) => {
                if let Some(pending) = issue.pending_payout.as_mut() {
                    pending.proposal_id = Some(proposal_id);
                } else {
                    return PromiseOrValue::Value(());
                }
                issue.payout_proposal_id = Some(proposal_id);
                issue.status = IssueStatus::PayoutPending;
                issue.blocked_reason = None;
                self.issues.insert(issue_id, issue);
                self.start_payout_vote(issue_id)
            }
            Err(_) => {
                let reason = "DAO proposal creation failed";
                issue.status = IssueStatus::Merged;
                issue.pending_payout = None;
                issue.payout_proposal_id = None;
                issue.blocked_reason = Some(reason.to_string());
                self.issues.insert(issue_id, issue);
                events::payout_request_failed(issue_id, reason.to_string());
                PromiseOrValue::Value(())
            }
        }
    }

    #[private]
    pub fn on_payout_vote_result(
        &mut self,
        issue_id: IssueId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        let mut issue = match self.issues.get(&issue_id).cloned() {
            Some(issue) => issue,
            None => return,
        };
        let Some(pending) = issue.pending_payout.clone() else {
            return;
        };
        let Some(proposal_id) = pending.proposal_id else {
            return;
        };

        match result {
            Ok(()) => {
                issue.status = IssueStatus::PayoutPending;
                issue.blocked_reason = None;
                self.issues.insert(issue_id, issue);
                events::payout_requested(
                    issue_id,
                    proposal_id,
                    pending.recipient,
                    pending.amount.0,
                );
            }
            Err(_) => {
                let reason = "DAO auto-vote failed";
                issue.blocked_reason = Some(reason.to_string());
                self.issues.insert(issue_id, issue);
                events::payout_request_failed(issue_id, reason.to_string());
            }
        }
    }

    #[handle_result]
    pub fn retry_payout_vote(&mut self, issue_id: IssueId) -> Result<Promise, ContractError> {
        let issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?;
        if issue.status != IssueStatus::PayoutPending {
            return Err(ContractError::InvalidState);
        }
        let proposal_id = issue
            .pending_payout
            .as_ref()
            .and_then(|pending| pending.proposal_id)
            .or(issue.payout_proposal_id)
            .ok_or(ContractError::InvalidState)?;

        Ok(dao::ext_dao::ext(self.dao.clone())
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_GET_PROPOSAL))
            .get_proposal(proposal_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_gas(GAS_FOR_PAYOUT_CALLBACK))
                    .on_retry_payout_proposal(issue_id),
            ))
    }

    #[private]
    pub fn on_retry_payout_proposal(
        &mut self,
        issue_id: IssueId,
        #[callback_result] result: Result<ProposalOutput, PromiseError>,
    ) -> PromiseOrValue<()> {
        match result {
            Ok(output) => match output.proposal.status {
                ProposalStatus::InProgress => self.start_payout_vote(issue_id),
                ProposalStatus::Approved => {
                    self.mark_payout_pending(issue_id);
                    PromiseOrValue::Value(())
                }
                _ => {
                    self.set_payout_blocked(issue_id, "payout proposal is not in progress");
                    PromiseOrValue::Value(())
                }
            },
            Err(_) => {
                self.set_payout_blocked(issue_id, "payout proposal lookup failed");
                PromiseOrValue::Value(())
            }
        }
    }

    #[handle_result]
    pub fn sync_payout_proposal(&mut self, issue_id: IssueId) -> Result<Promise, ContractError> {
        let issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?;
        let proposal_id = issue
            .payout_proposal_id
            .or_else(|| {
                issue
                    .pending_payout
                    .as_ref()
                    .and_then(|pending| pending.proposal_id)
            })
            .ok_or(ContractError::InvalidState)?;

        Ok(dao::ext_dao::ext(self.dao.clone())
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_GET_PROPOSAL))
            .get_proposal(proposal_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_gas(GAS_FOR_PAYOUT_CALLBACK))
                    .on_sync_payout_proposal(issue_id),
            ))
    }

    #[private]
    pub fn on_sync_payout_proposal(
        &mut self,
        issue_id: IssueId,
        #[callback_result] result: Result<ProposalOutput, PromiseError>,
    ) {
        match result {
            Ok(output) => self.apply_payout_proposal_status(issue_id, output.proposal.status),
            Err(_) => self.set_payout_blocked(issue_id, "payout proposal lookup failed"),
        }
    }

    #[handle_result]
    pub fn finalize_payout_proposal(
        &mut self,
        issue_id: IssueId,
    ) -> Result<Promise, ContractError> {
        access::assert_dao(self)?;
        let issue = self
            .issues
            .get(&issue_id)
            .ok_or(ContractError::IssueNotFound)?;
        let proposal_id = issue
            .payout_proposal_id
            .or_else(|| {
                issue
                    .pending_payout
                    .as_ref()
                    .and_then(|pending| pending.proposal_id)
            })
            .ok_or(ContractError::InvalidState)?;

        Ok(dao::ext_dao::ext(self.dao.clone())
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_GET_PROPOSAL))
            .get_proposal(proposal_id)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_gas(GAS_FOR_PAYOUT_CALLBACK))
                    .on_finalize_payout_proposal(issue_id),
            ))
    }

    #[private]
    pub fn on_finalize_payout_proposal(
        &mut self,
        issue_id: IssueId,
        #[callback_result] result: Result<ProposalOutput, PromiseError>,
    ) {
        match result {
            Ok(output) => self.apply_payout_proposal_status(issue_id, output.proposal.status),
            Err(_) => self.set_payout_blocked(issue_id, "payout proposal lookup failed"),
        }
    }

    fn resolve_recipient(&self, issue: &Issue) -> Result<AccountId, ContractError> {
        match issue.kind {
            IssueKind::PublicIssue => {
                let proof = issue
                    .merge_proof
                    .as_ref()
                    .ok_or(ContractError::InvalidState)?;
                self.identities
                    .get(&proof.pr_author)
                    .cloned()
                    .ok_or(ContractError::IdentityNotLinked)
            }
            IssueKind::PrivateSecurity => {
                let security = issue
                    .security
                    .as_ref()
                    .ok_or(ContractError::SecurityNotDisclosed)?;
                self.identities
                    .get(&security.researcher_github)
                    .cloned()
                    .ok_or(ContractError::IdentityNotLinked)
            }
        }
    }

    fn approvals_sufficient(&self, issue: &Issue) -> bool {
        if issue.approvals.iter().any(|approval| {
            matches!(
                approval.source,
                ApprovalSource::AutoS3 | ApprovalSource::Council | ApprovalSource::BootstrapCouncil
            )
        }) {
            return true;
        }
        self.unconflicted_approvals(issue) >= issue.tier.required_maintainer_approvals()
    }

    fn start_payout_vote(&mut self, issue_id: IssueId) -> PromiseOrValue<()> {
        let Some(issue) = self.issues.get(&issue_id) else {
            return PromiseOrValue::Value(());
        };
        let Some(pending) = issue.pending_payout.as_ref() else {
            return PromiseOrValue::Value(());
        };
        let Some(proposal_id) = pending.proposal_id else {
            return PromiseOrValue::Value(());
        };

        let promise = dao::ext_dao::ext(self.dao.clone())
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_ACT_PROPOSAL))
            .act_proposal(
                proposal_id,
                Action::VoteApprove,
                Some("BountyBoard auto-vote".to_string()),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(near_sdk::Gas::from_gas(GAS_FOR_PAYOUT_CALLBACK))
                    .on_payout_vote_result(issue_id),
            );
        PromiseOrValue::Promise(promise)
    }

    fn apply_payout_proposal_status(&mut self, issue_id: IssueId, status: ProposalStatus) {
        match status {
            ProposalStatus::InProgress => {}
            ProposalStatus::Approved => self.mark_payout_pending(issue_id),
            ProposalStatus::Rejected => {
                self.reset_payout_to_merged(issue_id, "payout proposal rejected")
            }
            ProposalStatus::Removed => {
                self.reset_payout_to_merged(issue_id, "payout proposal removed")
            }
            ProposalStatus::Expired => {
                self.reset_payout_to_merged(issue_id, "payout proposal expired")
            }
            ProposalStatus::Moved => self.reset_payout_to_merged(issue_id, "payout proposal moved"),
        }
    }

    fn mark_payout_pending(&mut self, issue_id: IssueId) {
        if let Some(mut issue) = self.issues.get(&issue_id).cloned()
            && issue.pending_payout.is_some()
        {
            issue.status = IssueStatus::PayoutPending;
            issue.blocked_reason = None;
            self.issues.insert(issue_id, issue);
        }
    }

    fn set_payout_blocked(&mut self, issue_id: IssueId, reason: &str) {
        if let Some(mut issue) = self.issues.get(&issue_id).cloned() {
            issue.blocked_reason = Some(reason.to_string());
            self.issues.insert(issue_id, issue);
            events::payout_request_failed(issue_id, reason.to_string());
        }
    }

    fn reset_payout_to_merged(&mut self, issue_id: IssueId, reason: &str) {
        if let Some(mut issue) = self.issues.get(&issue_id).cloned() {
            issue.status = IssueStatus::Merged;
            issue.pending_payout = None;
            issue.payout_proposal_id = None;
            issue.blocked_reason = Some(reason.to_string());
            self.issues.insert(issue_id, issue);
            events::payout_request_failed(issue_id, reason.to_string());
        }
    }

    #[handle_result]
    pub fn add_repo(
        &mut self,
        github_repo: String,
        maintainers: Vec<AccountId>,
        oracle: AccountId,
    ) -> Result<(), ContractError> {
        access::assert_dao(self)?;

        if self.repos.contains_key(&REPO_ID) {
            return Err(ContractError::DuplicateRepo);
        }
        if maintainers.is_empty() {
            return Err(ContractError::EmptyMaintainers);
        }

        let now = env::block_timestamp();
        let mut records = BTreeMap::new();
        for account in maintainers {
            records.entry(account).or_insert(MaintainerRecord {
                since: now,
                bounties_approved: 0,
                last_council_request_at: 0,
            });
        }
        let bootstrap_ended = records.len() >= self.bootstrap_until_maintainers as usize;
        let maintainers = records.keys().cloned().collect::<Vec<AccountId>>();

        self.repos.insert(
            REPO_ID,
            Repo {
                github_repo: github_repo.clone(),
                maintainers: records,
                oracle: oracle.clone(),
                budget: U128(0),
                committed: U128(0),
                daily_cap: U128(DEFAULT_DAILY_CAP_YOCTO),
                paused: false,
                bootstrap_ended,
            },
        );
        events::repo_added(REPO_ID, github_repo, maintainers, oracle);

        Ok(())
    }

    #[handle_result]
    pub fn set_budget(&mut self, repo_id: RepoId, amount: U128) -> Result<(), ContractError> {
        access::assert_dao(self)?;

        let repo = self
            .repos
            .get_mut(&repo_id)
            .ok_or(ContractError::RepoNotFound)?;
        if amount.0 < repo.committed.0 {
            return Err(ContractError::BudgetBelowCommitted);
        }
        repo.budget = amount;
        let committed = repo.committed.0;
        events::repo_budget_set(repo_id, amount.0, committed);

        Ok(())
    }

    #[handle_result]
    pub fn pause_repo(&mut self, repo_id: RepoId, paused: bool) -> Result<(), ContractError> {
        access::assert_dao(self)?;

        let repo = self
            .repos
            .get_mut(&repo_id)
            .ok_or(ContractError::RepoNotFound)?;
        repo.paused = paused;
        events::repo_paused(repo_id, paused);

        Ok(())
    }

    pub fn get_dao_params(&self) -> DaoParams {
        self.dao_params.clone()
    }

    #[payable]
    pub fn fund_reserve(&mut self) {}

    pub fn get_reserve(&self) -> U128 {
        U128(env::account_balance().as_yoctonear())
    }

    pub fn sync_dao_params(&self) -> Promise {
        dao::ext_dao::ext(self.dao.clone())
            .with_static_gas(near_sdk::Gas::from_gas(dao::GAS_FOR_GET_POLICY))
            .get_policy()
    }

    #[private]
    pub fn on_dao_policy(&mut self, #[callback_result] result: Result<Policy, PromiseError>) {
        match result {
            Ok(policy) => self.apply_dao_policy(&policy),
            Err(_) => env::log_str("sync_dao_params failed"),
        }
    }

    fn apply_dao_policy(&mut self, policy: &Policy) {
        self.dao_params.proposal_bond = policy.proposal_bond;
        self.dao_params.bounty_bond = policy.bounty_bond;
        self.dao_params.proposal_period = policy.proposal_period.0;
        self.dao_params.bounty_forgiveness_period = policy.bounty_forgiveness_period.0;
        self.dao_params.synced_at = env::block_timestamp();
    }

    pub fn get_config(&self) -> BoardConfig {
        BoardConfig {
            bootstrap_until_maintainers: self.bootstrap_until_maintainers,
            maintainer_challenge_secs: self.maintainer_challenge_secs,
            council_promotion_min_tenure_secs: self.council_promotion_min_tenure_secs,
            council_promotion_delay_secs: self.council_promotion_delay_secs,
            council_promotion_min_approvals: self.council_promotion_min_approvals,
            council_role_name: self.council_role_name.clone(),
        }
    }

    pub fn get_repo(&self) -> Option<Repo> {
        self.repos.get(&REPO_ID).cloned()
    }

    pub fn get_budget(&self) -> Option<BudgetView> {
        self.repos.get(&REPO_ID).map(|repo| BudgetView {
            budget: repo.budget,
            committed: repo.committed,
            available: U128(repo.budget.0.saturating_sub(repo.committed.0)),
            daily_cap: repo.daily_cap,
            paused: repo.paused,
        })
    }

    pub fn get_maintainers(&self) -> BTreeMap<AccountId, MaintainerRecord> {
        self.repos
            .get(&REPO_ID)
            .map(|repo| repo.maintainers.clone())
            .unwrap_or_default()
    }

    pub fn get_bootstrap_state(&self) -> BootstrapState {
        let threshold = self.bootstrap_until_maintainers;
        match self.repos.get(&REPO_ID) {
            Some(repo) => {
                let maintainers_len = repo.maintainers.len() as u32;
                BootstrapState {
                    active: !repo.bootstrap_ended && maintainers_len < threshold,
                    maintainers_len,
                    threshold,
                    ended: repo.bootstrap_ended,
                }
            }
            None => BootstrapState {
                active: false,
                maintainers_len: 0,
                threshold,
                ended: false,
            },
        }
    }

    pub fn get_issues(&self, from: u32, limit: u32) -> Vec<Issue> {
        paginate(
            self.issues.iter().map(|(_, issue)| issue.clone()),
            from,
            limit,
        )
    }

    pub fn get_payouts(&self, from: u32, limit: u32) -> Vec<PayoutRecord> {
        paginate(
            self.payouts.iter().map(|(_, payout)| payout.clone()),
            from,
            limit,
        )
    }

    pub fn get_candidates(&self, from: u32, limit: u32) -> Vec<Candidate> {
        paginate(
            self.candidates
                .iter()
                .map(|(_, candidate)| candidate.clone()),
            from,
            limit,
        )
    }

    pub fn get_council_requests(&self, from: u32, limit: u32) -> Vec<CouncilRequest> {
        paginate(
            self.council_requests
                .iter()
                .map(|(_, request)| request.clone()),
            from,
            limit,
        )
    }

    pub fn get_issue(&self, issue_id: IssueId) -> Option<Issue> {
        self.issues.get(&issue_id).cloned()
    }

    pub fn get_issue_by_number(&self, issue_number: u64) -> Option<Issue> {
        self.issue_by_number
            .get(&(REPO_ID, issue_number))
            .and_then(|issue_id| self.issues.get(issue_id))
            .cloned()
    }

    pub fn get_issue_by_private_ref(&self, private_ref: String) -> Option<Issue> {
        self.private_refs
            .get(&private_ref)
            .and_then(|issue_id| self.issues.get(issue_id))
            .cloned()
    }
}

fn payout_proposal_kind(issue_id: IssueId, amount: u128) -> ProposalKind {
    let args = near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({ "issue_id": issue_id }))
        .unwrap_or_default();
    ProposalKind::FunctionCall {
        receiver_id: env::current_account_id(),
        actions: vec![ActionCall {
            method_name: "payout_near".to_string(),
            args: Base64VecU8(args),
            deposit: U128(amount),
            gas: near_sdk::json_types::U64(GAS_FOR_PAYOUT),
        }],
    }
}

fn approved_status(issue: &Issue) -> IssueStatus {
    if issue.merge_proof.is_some() || issue.security.is_some() {
        IssueStatus::Merged
    } else {
        IssueStatus::Approved
    }
}

fn paginate<T>(items: impl Iterator<Item = T>, from: u32, limit: u32) -> Vec<T> {
    items
        .skip(from as usize)
        .take(limit as usize)
        .collect::<Vec<T>>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dao::{Proposal, ProposalOutput, ProposalStatus};
    use crate::types::{
        Approval, IssueKind, IssueStatus, MergeProof, MergeSource, ONE_NEAR, PayoutProof,
        PayoutStatus, Tier,
    };
    use near_sdk::test_utils::{VMContextBuilder, accounts, get_logs};
    use near_sdk::testing_env;

    fn context() {
        testing_env!(VMContextBuilder::new().build());
    }

    fn set_predecessor(account: AccountId) {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account);
        testing_env!(builder.build());
    }

    #[test]
    fn new_stores_dao() {
        context();
        let dao = accounts(1);
        let contract = BountyBoard::new(dao.clone(), None);
        assert_eq!(contract.get_dao(), dao);
    }

    #[test]
    fn new_uses_production_defaults() {
        context();
        let dao = accounts(0);
        let contract = BountyBoard::new(dao.clone(), None);

        assert_eq!(contract.dao, dao);
        assert_eq!(contract.bootstrap_until_maintainers, 3);
        assert_eq!(contract.maintainer_challenge_secs, 604_800);
        assert_eq!(contract.council_promotion_min_tenure_secs, 604_800);
        assert_eq!(contract.council_promotion_delay_secs, 604_800);
        assert_eq!(contract.council_promotion_min_approvals, 3);
        assert_eq!(contract.council_role_name, "council");
        assert_eq!(contract.next_issue_id, 0);
        assert_eq!(contract.next_payout_id, 0);
        assert_eq!(contract.dao_params, DaoParams::default());
        assert_eq!(contract.repos.len(), 0);
        assert_eq!(contract.issues.len(), 0);
        assert_eq!(contract.payouts.len(), 0);
        assert_eq!(contract.reputation.len(), 0);
        assert_eq!(contract.candidates.len(), 0);
        assert_eq!(contract.council_requests.len(), 0);
    }

    #[test]
    fn new_accepts_demo_timing_overrides() {
        context();
        let config = BoardConfig {
            bootstrap_until_maintainers: 2,
            maintainer_challenge_secs: 90,
            council_promotion_min_tenure_secs: 60,
            council_promotion_delay_secs: 30,
            council_promotion_min_approvals: 1,
            council_role_name: "council".to_string(),
        };
        let contract = BountyBoard::new(accounts(0), Some(config));

        assert_eq!(contract.bootstrap_until_maintainers, 2);
        assert_eq!(contract.maintainer_challenge_secs, 90);
        assert_eq!(contract.council_promotion_min_tenure_secs, 60);
        assert_eq!(contract.council_promotion_delay_secs, 30);
        assert_eq!(contract.council_promotion_min_approvals, 1);
    }

    fn sample_repo() -> Repo {
        let mut maintainers = BTreeMap::new();
        maintainers.insert(
            accounts(1),
            MaintainerRecord {
                since: 10,
                bounties_approved: 2,
                last_council_request_at: 0,
            },
        );
        Repo {
            github_repo: "owner/repo".to_string(),
            maintainers,
            oracle: accounts(2),
            budget: U128(100),
            committed: U128(40),
            daily_cap: U128(25),
            paused: false,
            bootstrap_ended: false,
        }
    }

    fn sample_issue(kind: IssueKind, identifier: u64) -> Issue {
        Issue {
            repo_id: REPO_ID,
            kind,
            issue_number: if kind == IssueKind::PublicIssue {
                Some(identifier)
            } else {
                None
            },
            private_ref: if kind == IssueKind::PrivateSecurity {
                Some(format!("{identifier:064x}"))
            } else {
                None
            },
            tier: Tier::S2,
            amount: U128(10),
            status: IssueStatus::PendingApproval,
            creator: accounts(0),
            claimants: Vec::new(),
            approvals: Vec::<Approval>::new(),
            intended_contributor: None,
            merge_proof: None,
            security: None,
            s0: None,
            payout_id: None,
            payout_proposal_id: None,
            pending_payout: None,
            blocked_reason: None,
            cancelled_by: None,
            created_at: 0,
        }
    }

    fn contract_with_repo(
        maintainers: Vec<AccountId>,
        budget: u128,
        daily_cap: u128,
    ) -> BountyBoard {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let mut records = BTreeMap::new();
        for maintainer in maintainers {
            records.insert(
                maintainer,
                MaintainerRecord {
                    since: 0,
                    bounties_approved: 0,
                    last_council_request_at: 0,
                },
            );
        }
        contract.repos.insert(
            REPO_ID,
            Repo {
                github_repo: "owner/repo".to_string(),
                maintainers: records,
                oracle: accounts(2),
                budget: U128(budget),
                committed: U128(0),
                daily_cap: U128(daily_cap),
                paused: false,
                bootstrap_ended: false,
            },
        );
        contract
    }

    fn set_completed(contract: &mut BountyBoard, account: AccountId, completed: u64) {
        contract.reputation.insert(
            account,
            Reputation {
                completed,
                total_earned: U128(0),
                points: 0,
                has_s1_or_s0: false,
                payout_ids: Vec::new(),
            },
        );
    }

    #[test]
    fn s3_auto_approves_trusted_intended_contributor() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        set_completed(&mut contract, accounts(3), S3_AUTO_MIN_COMPLETED);
        set_predecessor(accounts(1));

        let issue_id = contract
            .create_bounty(7, Tier::S3, U128(10 * ONE_NEAR), Some(accounts(3)))
            .unwrap();

        let issue = contract.issues.get(&issue_id).unwrap();
        assert_eq!(issue.status, IssueStatus::Approved);
        assert_eq!(issue.intended_contributor, Some(accounts(3)));
        assert_eq!(issue.approvals.len(), 1);
        assert_eq!(issue.approvals[0].approver, accounts(3));
        assert_eq!(issue.approvals[0].source, ApprovalSource::AutoS3);
    }

    #[test]
    fn s3_requires_approval_when_auto_conditions_do_not_hold() {
        let mut contract = contract_with_repo(vec![accounts(1)], 200 * ONE_NEAR, 100 * ONE_NEAR);
        set_completed(&mut contract, accounts(3), S3_AUTO_MIN_COMPLETED - 1);
        set_completed(&mut contract, accounts(1), S3_AUTO_MIN_COMPLETED);
        set_completed(&mut contract, accounts(4), S3_AUTO_MIN_COMPLETED);
        set_predecessor(accounts(1));

        let untrusted = contract
            .create_bounty(1, Tier::S3, U128(10 * ONE_NEAR), Some(accounts(3)))
            .unwrap();
        assert_eq!(
            contract.issues.get(&untrusted).unwrap().status,
            IssueStatus::PendingApproval
        );

        let over_cap = contract
            .create_bounty(2, Tier::S3, U128(26 * ONE_NEAR), Some(accounts(4)))
            .unwrap();
        assert_eq!(
            contract.issues.get(&over_cap).unwrap().status,
            IssueStatus::PendingApproval
        );

        let no_contributor = contract
            .create_bounty(3, Tier::S3, U128(10 * ONE_NEAR), None)
            .unwrap();
        assert_eq!(
            contract.issues.get(&no_contributor).unwrap().status,
            IssueStatus::PendingApproval
        );

        let self_dealing = contract
            .create_bounty(4, Tier::S3, U128(10 * ONE_NEAR), Some(accounts(1)))
            .unwrap();
        assert_eq!(
            contract.issues.get(&self_dealing).unwrap().status,
            IssueStatus::PendingApproval
        );
    }

    #[test]
    fn non_s3_never_auto_approves() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        set_completed(&mut contract, accounts(3), S3_AUTO_MIN_COMPLETED);
        set_predecessor(accounts(1));

        let issue_id = contract
            .create_bounty(1, Tier::S2, U128(10 * ONE_NEAR), Some(accounts(3)))
            .unwrap();
        assert_eq!(
            contract.issues.get(&issue_id).unwrap().status,
            IssueStatus::PendingApproval
        );
    }

    #[test]
    fn create_bounty_stores_public_issue_and_commits_budget() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        set_predecessor(accounts(1));

        let issue_id = contract
            .create_bounty(7, Tier::S2, U128(10 * ONE_NEAR), None)
            .unwrap();

        let issue = contract.get_issue_by_number(7).unwrap();
        assert_eq!(issue_id, 0);
        assert_eq!(issue.kind, IssueKind::PublicIssue);
        assert_eq!(issue.issue_number, Some(7));
        assert_eq!(issue.status, IssueStatus::PendingApproval);
        assert_eq!(issue.amount, U128(10 * ONE_NEAR));
        assert_eq!(issue.creator, accounts(1));
        assert_eq!(
            contract.repos.get(&REPO_ID).unwrap().committed,
            U128(10 * ONE_NEAR)
        );
        assert_eq!(
            contract.daily_spend.get(&(0, accounts(1))),
            Some(&(10 * ONE_NEAR))
        );
    }

    #[test]
    fn create_bounty_rejects_duplicate_issue_number() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        set_predecessor(accounts(1));

        contract.create_bounty(7, Tier::S2, U128(1), None).unwrap();
        assert_eq!(
            contract.create_bounty(7, Tier::S3, U128(1), None),
            Err(ContractError::DuplicateIssueNumber)
        );
    }

    #[test]
    fn create_bounty_rejects_paused_repo() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        contract.repos.get_mut(&REPO_ID).unwrap().paused = true;
        set_predecessor(accounts(1));

        assert_eq!(
            contract.create_bounty(7, Tier::S2, U128(ONE_NEAR), None),
            Err(ContractError::RepoPaused)
        );
    }

    #[test]
    fn create_bounty_enforces_budget_daily_cap_and_tier_rules() {
        let mut contract = contract_with_repo(vec![accounts(1)], 10 * ONE_NEAR, 5 * ONE_NEAR);
        set_predecessor(accounts(1));

        assert_eq!(
            contract.create_bounty(1, Tier::S0, U128(ONE_NEAR), None),
            Err(ContractError::S0NotEnabled)
        );
        assert_eq!(
            contract.create_bounty(1, Tier::S2, U128(0), None),
            Err(ContractError::InvalidAmount)
        );
        assert_eq!(
            contract.create_bounty(1, Tier::S2, U128(11 * ONE_NEAR), None),
            Err(ContractError::BudgetExceeded)
        );
        assert_eq!(
            contract.create_bounty(1, Tier::S2, U128(6 * ONE_NEAR), None),
            Err(ContractError::DailyCapExceeded)
        );
        assert_eq!(
            contract.create_bounty(1, Tier::S1, U128(6 * ONE_NEAR), None),
            Ok(0)
        );
    }

    #[test]
    fn create_bounty_requires_maintainer() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 25 * ONE_NEAR);
        set_predecessor(accounts(5));

        assert_eq!(
            contract.create_bounty(7, Tier::S2, U128(ONE_NEAR), None),
            Err(ContractError::NotMaintainer)
        );
    }

    #[test]
    fn empty_views_return_empty_results() {
        context();
        let contract = BountyBoard::new(accounts(0), None);

        assert_eq!(contract.get_config(), BoardConfig::default());
        assert_eq!(contract.get_repo(), None);
        assert_eq!(contract.get_budget(), None);
        assert!(contract.get_maintainers().is_empty());
        assert!(contract.get_issues(0, 10).is_empty());
        assert!(contract.get_payouts(0, 10).is_empty());
        assert!(contract.get_candidates(0, 10).is_empty());
        assert!(contract.get_council_requests(0, 10).is_empty());
        assert_eq!(contract.get_issue_by_private_ref("a".repeat(64)), None);
        assert_eq!(contract.get_issue_by_number(1), None);
    }

    #[test]
    fn issue_views_paginate_and_look_up_private_refs() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let public = sample_issue(IssueKind::PublicIssue, 1);
        let private = sample_issue(IssueKind::PrivateSecurity, 2);

        contract.issues.insert(1, public.clone());
        contract.issues.insert(2, private.clone());
        contract
            .private_refs
            .insert(private.private_ref.clone().unwrap(), 2);

        assert_eq!(contract.get_issues(0, 10).len(), 2);
        assert_eq!(contract.get_issues(1, 1).len(), 1);
        assert!(contract.get_issues(5, 10).is_empty());
        assert_eq!(
            contract.get_issue_by_private_ref(private.private_ref.clone().unwrap()),
            Some(private)
        );
        assert_eq!(contract.get_issue_by_private_ref("b".repeat(64)), None);
        assert_eq!(contract.get_issue_by_number(1), None);
    }

    #[test]
    fn get_issue_by_number_finds_only_indexed_public_issues() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let public = sample_issue(IssueKind::PublicIssue, 7);
        let private = sample_issue(IssueKind::PrivateSecurity, 8);

        contract.issues.insert(1, public.clone());
        contract.issues.insert(2, private.clone());
        contract.issue_by_number.insert((REPO_ID, 7), 1);

        assert_eq!(contract.get_issue_by_number(7), Some(public));
        assert_eq!(contract.get_issue_by_number(8), None);
        assert_eq!(contract.get_issue_by_number(9), None);
    }

    #[test]
    fn undisclosed_private_issue_view_is_redacted() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract
            .issues
            .insert(1, sample_issue(IssueKind::PrivateSecurity, 3));

        let json = serde_json::to_string(&contract.get_issues(0, 10)).unwrap();
        assert!(json.contains("private_ref"));
        assert!(!json.contains("ghsa_id"));
        assert!(!json.contains("advisory_url"));
        assert!(!json.contains("researcher_github"));
    }

    #[test]
    fn fund_reserve_leaves_state_untouched_and_reports_balance() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let balance = env::account_balance().as_yoctonear();

        contract.fund_reserve();

        assert_eq!(contract.get_reserve(), U128(balance));
        assert_eq!(contract.get_dao_params(), DaoParams::default());
    }

    #[test]
    fn apply_dao_policy_stores_bonds_and_periods() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let policy = Policy {
            roles: vec![],
            default_vote_policy: crate::dao::VotePolicy {
                weight_kind: crate::dao::WeightKind::RoleWeight,
                quorum: U128(0),
                threshold: crate::dao::WeightOrRatio::Ratio(1, 2),
            },
            proposal_bond: U128(ONE_NEAR),
            proposal_period: near_sdk::json_types::U64(604_800_000_000_000),
            bounty_bond: U128(2 * ONE_NEAR),
            bounty_forgiveness_period: near_sdk::json_types::U64(86_400_000_000_000),
        };

        contract.apply_dao_policy(&policy);

        assert_eq!(contract.dao_params.proposal_bond, U128(ONE_NEAR));
        assert_eq!(contract.dao_params.bounty_bond, U128(2 * ONE_NEAR));
        assert_eq!(contract.dao_params.proposal_period, 604_800_000_000_000);
        assert_eq!(
            contract.dao_params.bounty_forgiveness_period,
            86_400_000_000_000
        );
        assert_eq!(contract.dao_params.synced_at, env::block_timestamp());
    }

    #[test]
    fn dao_params_start_at_zero_and_return_stored_values() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        assert_eq!(contract.get_dao_params(), DaoParams::default());

        contract.dao_params = DaoParams {
            proposal_bond: U128(ONE_NEAR),
            bounty_bond: U128(2 * ONE_NEAR),
            proposal_period: 10,
            bounty_forgiveness_period: 20,
            synced_at: 30,
        };
        assert_eq!(contract.get_dao_params(), contract.dao_params);
    }

    #[test]
    fn repo_views_return_repo_state() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());

        assert_eq!(contract.get_repo(), Some(sample_repo()));
        assert_eq!(contract.get_maintainers().len(), 1);
        assert_eq!(
            contract.get_budget(),
            Some(BudgetView {
                budget: U128(100),
                committed: U128(40),
                available: U128(60),
                daily_cap: U128(25),
                paused: false,
            })
        );
    }

    #[test]
    fn remaining_list_views_paginate() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.payouts.insert(
            1,
            PayoutRecord {
                issue_id: 1,
                recipient: accounts(3),
                amount: U128(10),
                tier: Tier::S2,
                points: 3,
                status: PayoutStatus::Paid,
                attempt: 1,
                proof: PayoutProof::PullRequest {
                    pr_number: 7,
                    commit: "abc".to_string(),
                },
                created_at: 1,
                updated_at: 2,
            },
        );
        contract.candidates.insert(
            accounts(3),
            Candidate {
                account: accounts(3),
                created_at: 1,
                challenge_until: 2,
                vetoed: false,
                points_at_creation: 10,
                completed_at_creation: 3,
            },
        );
        contract.council_requests.insert(
            accounts(3),
            CouncilRequest {
                last_proposal_at: 1,
                active_proposal_id: None,
            },
        );

        assert_eq!(contract.get_payouts(0, 10).len(), 1);
        assert_eq!(contract.get_payouts(1, 10).len(), 0);
        assert_eq!(contract.get_candidates(0, 10).len(), 1);
        assert_eq!(contract.get_candidates(1, 10).len(), 0);
        assert_eq!(contract.get_council_requests(0, 10).len(), 1);
        assert_eq!(contract.get_council_requests(1, 10).len(), 0);
    }

    #[test]
    fn claim_is_non_exclusive_and_idempotent() {
        let mut contract = BountyBoard::new(accounts(0), None);
        contract
            .issues
            .insert(1, sample_issue(IssueKind::PublicIssue, 7));

        set_predecessor(accounts(1));
        contract.claim(1).unwrap();
        contract.claim(1).unwrap();
        set_predecessor(accounts(2));
        contract.claim(1).unwrap();

        assert_eq!(
            contract.issues.get(&1).unwrap().claimants,
            vec![accounts(1), accounts(2)]
        );
    }

    #[test]
    fn claim_rejects_closed_and_private_issues() {
        let mut contract = BountyBoard::new(accounts(0), None);
        let mut paid = sample_issue(IssueKind::PublicIssue, 1);
        paid.status = IssueStatus::Paid;
        let mut cancelled = sample_issue(IssueKind::PublicIssue, 2);
        cancelled.status = IssueStatus::Cancelled;
        contract.issues.insert(1, paid);
        contract.issues.insert(2, cancelled);
        contract
            .issues
            .insert(3, sample_issue(IssueKind::PrivateSecurity, 3));
        set_predecessor(accounts(1));

        assert_eq!(contract.claim(1), Err(ContractError::InvalidState));
        assert_eq!(contract.claim(2), Err(ContractError::InvalidState));
        assert_eq!(
            contract.claim(3),
            Err(ContractError::PrivateSecurityNoClaims)
        );
        assert_eq!(contract.claim(99), Err(ContractError::IssueNotFound));
    }

    #[test]
    fn claim_list_is_capped() {
        let mut contract = BountyBoard::new(accounts(0), None);
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.claimants = (0..MAX_CLAIMANTS)
            .map(|index| format!("claimant{index}.near").parse().unwrap())
            .collect();
        contract.issues.insert(1, issue);
        set_predecessor(accounts(1));

        assert_eq!(contract.claim(1), Err(ContractError::ClaimantLimitReached));
    }

    fn three_maintainer_contract() -> BountyBoard {
        contract_with_repo(
            vec![accounts(1), accounts(3), accounts(4)],
            100 * ONE_NEAR,
            100 * ONE_NEAR,
        )
    }

    #[test]
    fn approve_records_distinct_maintainers_and_uses_tier_threshold() {
        let mut contract = three_maintainer_contract();
        set_predecessor(accounts(1));

        let s1 = contract
            .create_bounty(1, Tier::S1, U128(3 * ONE_NEAR), None)
            .unwrap();
        set_predecessor(accounts(3));
        contract.approve(s1).unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::PendingApproval
        );
        set_predecessor(accounts(4));
        contract.approve(s1).unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::Approved
        );

        set_predecessor(accounts(1));
        let s2 = contract
            .create_bounty(2, Tier::S2, U128(3 * ONE_NEAR), None)
            .unwrap();
        set_predecessor(accounts(3));
        contract.approve(s2).unwrap();
        assert_eq!(
            contract.issues.get(&s2).unwrap().status,
            IssueStatus::Approved
        );

        set_predecessor(accounts(1));
        let s3 = contract
            .create_bounty(3, Tier::S3, U128(3 * ONE_NEAR), None)
            .unwrap();
        set_predecessor(accounts(4));
        contract.approve(s3).unwrap();
        assert_eq!(
            contract.issues.get(&s3).unwrap().status,
            IssueStatus::Approved
        );
    }

    #[test]
    fn approve_rejects_self_claimant_duplicate_and_non_maintainer() {
        let mut contract = three_maintainer_contract();
        set_predecessor(accounts(1));
        let issue_id = contract
            .create_bounty(1, Tier::S2, U128(ONE_NEAR), None)
            .unwrap();

        assert_eq!(contract.approve(issue_id), Err(ContractError::Conflict));

        set_predecessor(accounts(3));
        contract.claim(issue_id).unwrap();
        assert_eq!(contract.approve(issue_id), Err(ContractError::Conflict));

        set_predecessor(accounts(3));
        let second = contract
            .create_bounty(2, Tier::S2, U128(ONE_NEAR), None)
            .unwrap();
        set_predecessor(accounts(1));
        contract.approve(second).unwrap();
        assert_eq!(contract.approve(second), Err(ContractError::InvalidState));

        set_predecessor(accounts(1));
        let third = contract
            .create_bounty(3, Tier::S2, U128(ONE_NEAR), None)
            .unwrap();
        set_predecessor(accounts(5));
        assert_eq!(contract.approve(third), Err(ContractError::NotMaintainer));
    }

    #[test]
    fn approve_rejects_pr_author_and_researcher_conflicts() {
        let mut contract = three_maintainer_contract();
        contract.identities.insert("alice".to_string(), accounts(3));
        contract
            .identities
            .insert("researcher".to_string(), accounts(4));

        let mut public = sample_issue(IssueKind::PublicIssue, 1);
        public.merge_proof = Some(crate::types::MergeProof {
            pr_number: 5,
            pr_author: "alice".to_string(),
            commit: "abc".to_string(),
            source: crate::types::MergeSource::Manual,
            merged_at: 1,
        });
        contract.issues.insert(1, public);
        set_predecessor(accounts(3));
        assert_eq!(contract.approve(1), Err(ContractError::Conflict));

        let mut private = sample_issue(IssueKind::PrivateSecurity, 2);
        private.security = Some(crate::types::SecurityDisclosure {
            ghsa_id: "GHSA-xxxx-yyyy-zzzz".to_string(),
            advisory_url: "https://example.com/advisory".to_string(),
            researcher_github: "researcher".to_string(),
            disclosed_at: 1,
        });
        contract.issues.insert(2, private);
        set_predecessor(accounts(4));
        assert_eq!(contract.approve(2), Err(ContractError::Conflict));
    }

    #[test]
    fn approve_returns_merged_when_completion_proof_exists() {
        let mut contract = three_maintainer_contract();
        contract.identities.insert("bob".to_string(), accounts(4));
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.merge_proof = Some(crate::types::MergeProof {
            pr_number: 5,
            pr_author: "bob".to_string(),
            commit: "abc".to_string(),
            source: crate::types::MergeSource::Oracle,
            merged_at: 1,
        });
        contract.issues.insert(1, issue);
        set_predecessor(accounts(3));

        contract.approve(1).unwrap();
        assert_eq!(contract.issues.get(&1).unwrap().status, IssueStatus::Merged);
    }

    fn normal_mode_contract() -> BountyBoard {
        let mut contract = three_maintainer_contract();
        contract.repos.get_mut(&REPO_ID).unwrap().bootstrap_ended = true;
        contract
    }

    #[test]
    fn insufficient_unconflicted_maintainers_escalate() {
        let mut two = contract_with_repo(
            vec![accounts(1), accounts(3)],
            100 * ONE_NEAR,
            100 * ONE_NEAR,
        );
        two.repos.get_mut(&REPO_ID).unwrap().bootstrap_ended = true;
        set_predecessor(accounts(1));
        let s1 = two
            .create_bounty(1, Tier::S1, U128(ONE_NEAR), None)
            .unwrap();
        assert_eq!(two.issues.get(&s1).unwrap().status, IssueStatus::Escalated);
        set_predecessor(accounts(3));
        assert_eq!(two.approve(s1), Err(ContractError::InvalidState));

        let mut one = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 100 * ONE_NEAR);
        one.repos.get_mut(&REPO_ID).unwrap().bootstrap_ended = true;
        set_predecessor(accounts(1));
        let s2 = one
            .create_bounty(1, Tier::S2, U128(ONE_NEAR), None)
            .unwrap();
        assert_eq!(one.issues.get(&s2).unwrap().status, IssueStatus::Escalated);
    }

    #[test]
    fn escalation_waits_for_approval_when_a_path_exists() {
        let mut contract = normal_mode_contract();
        set_predecessor(accounts(1));
        let s1 = contract
            .create_bounty(1, Tier::S1, U128(ONE_NEAR), None)
            .unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::PendingApproval
        );

        set_predecessor(accounts(3));
        contract.approve(s1).unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::PendingApproval
        );

        set_predecessor(accounts(4));
        contract.approve(s1).unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::Approved
        );
    }

    #[test]
    fn conflict_after_creation_can_escalate_an_issue() {
        let mut contract = normal_mode_contract();
        set_predecessor(accounts(1));
        let s1 = contract
            .create_bounty(1, Tier::S1, U128(ONE_NEAR), None)
            .unwrap();

        set_predecessor(accounts(4));
        contract.claim(s1).unwrap();
        set_predecessor(accounts(3));
        contract.approve(s1).unwrap();

        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::Escalated
        );
    }

    #[test]
    fn bootstrap_mode_does_not_escalate() {
        let mut contract = contract_with_repo(
            vec![accounts(1), accounts(3)],
            100 * ONE_NEAR,
            100 * ONE_NEAR,
        );
        set_predecessor(accounts(1));
        let s1 = contract
            .create_bounty(1, Tier::S1, U128(ONE_NEAR), None)
            .unwrap();
        assert_eq!(
            contract.issues.get(&s1).unwrap().status,
            IssueStatus::PendingApproval
        );
    }

    #[test]
    fn council_approve_is_dao_only_and_only_for_escalated_issues() {
        let mut contract = normal_mode_contract();
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.status = IssueStatus::Escalated;
        contract.issues.insert(1, issue);
        let mut pending = sample_issue(IssueKind::PublicIssue, 2);
        pending.status = IssueStatus::PendingApproval;
        contract.issues.insert(2, pending);

        set_predecessor(accounts(1));
        assert_eq!(contract.council_approve(1), Err(ContractError::NotDao));
        set_predecessor(accounts(0));
        assert_eq!(
            contract.council_approve(2),
            Err(ContractError::InvalidState)
        );
    }

    #[test]
    fn council_approve_sets_status_without_counting_as_maintainer_approval() {
        let mut contract = normal_mode_contract();
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.status = IssueStatus::Escalated;
        issue.approvals = vec![Approval {
            approver: accounts(3),
            source: ApprovalSource::Maintainer,
            at: 0,
        }];
        contract.issues.insert(1, issue);
        set_predecessor(accounts(0));

        contract.council_approve(1).unwrap();

        let issue = contract.issues.get(&1).unwrap();
        assert_eq!(issue.status, IssueStatus::Approved);
        assert_eq!(issue.approvals.len(), 2);
        assert_eq!(contract.unconflicted_approvals(issue), 1);
    }

    #[test]
    fn council_approve_restores_merged_after_post_merge_escalation() {
        let mut contract = normal_mode_contract();
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.status = IssueStatus::Escalated;
        issue.merge_proof = Some(crate::types::MergeProof {
            pr_number: 5,
            pr_author: "alice".to_string(),
            commit: "abc".to_string(),
            source: crate::types::MergeSource::Manual,
            merged_at: 1,
        });
        contract.issues.insert(1, issue);
        set_predecessor(accounts(0));

        contract.council_approve(1).unwrap();

        assert_eq!(contract.issues.get(&1).unwrap().status, IssueStatus::Merged);
    }

    #[test]
    fn bootstrap_approve_works_below_threshold_and_allows_self_approval() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 100 * ONE_NEAR);
        let mut issue = sample_issue(IssueKind::PublicIssue, 1);
        issue.creator = accounts(0);
        contract.issues.insert(1, issue);
        let mut escalated = sample_issue(IssueKind::PublicIssue, 2);
        escalated.status = IssueStatus::Escalated;
        contract.issues.insert(2, escalated);
        set_predecessor(accounts(0));

        contract.bootstrap_approve(1).unwrap();
        contract.bootstrap_approve(2).unwrap();

        let issue = contract.issues.get(&1).unwrap();
        assert_eq!(issue.status, IssueStatus::Approved);
        assert_eq!(issue.approvals[0].source, ApprovalSource::BootstrapCouncil);
        assert_eq!(issue.approvals[0].approver, accounts(0));
        assert_eq!(contract.unconflicted_approvals(issue), 0);
        assert_eq!(
            contract.issues.get(&2).unwrap().status,
            IssueStatus::Approved
        );
    }

    #[test]
    fn bootstrap_approve_rejects_threshold_reached_or_ended() {
        let mut at_threshold = contract_with_repo(
            vec![accounts(1), accounts(3), accounts(4)],
            100 * ONE_NEAR,
            100 * ONE_NEAR,
        );
        at_threshold
            .issues
            .insert(1, sample_issue(IssueKind::PublicIssue, 1));
        set_predecessor(accounts(0));
        assert_eq!(
            at_threshold.bootstrap_approve(1),
            Err(ContractError::InvalidState)
        );

        let mut ended = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 100 * ONE_NEAR);
        ended.repos.get_mut(&REPO_ID).unwrap().bootstrap_ended = true;
        ended
            .issues
            .insert(1, sample_issue(IssueKind::PublicIssue, 1));
        set_predecessor(accounts(0));
        assert_eq!(ended.bootstrap_approve(1), Err(ContractError::InvalidState));
    }

    #[test]
    fn bootstrap_approve_requires_dao_and_open_status() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 100 * ONE_NEAR);
        let mut approved = sample_issue(IssueKind::PublicIssue, 1);
        approved.status = IssueStatus::Approved;
        contract.issues.insert(1, approved);
        contract
            .issues
            .insert(2, sample_issue(IssueKind::PublicIssue, 2));

        set_predecessor(accounts(1));
        assert_eq!(contract.bootstrap_approve(2), Err(ContractError::NotDao));
        set_predecessor(accounts(0));
        assert_eq!(
            contract.bootstrap_approve(1),
            Err(ContractError::InvalidState)
        );
    }

    #[test]
    fn mark_spam_cancels_before_merge_and_releases_commitment() {
        let mut contract = three_maintainer_contract();
        set_predecessor(accounts(1));
        let issue_id = contract
            .create_bounty(1, Tier::S2, U128(10 * ONE_NEAR), None)
            .unwrap();
        assert_eq!(
            contract.repos.get(&REPO_ID).unwrap().committed,
            U128(10 * ONE_NEAR)
        );

        set_predecessor(accounts(3));
        contract.mark_spam(issue_id).unwrap();

        let issue = contract.issues.get(&issue_id).unwrap();
        assert_eq!(issue.status, IssueStatus::Cancelled);
        assert_eq!(issue.cancelled_by, Some(accounts(3)));
        assert_eq!(contract.repos.get(&REPO_ID).unwrap().committed, U128(0));
        assert_eq!(
            contract.mark_spam(issue_id),
            Err(ContractError::InvalidState)
        );
    }

    #[test]
    fn mark_spam_rejects_s0_private_and_post_merge_issues() {
        let mut contract = three_maintainer_contract();
        let mut s0 = sample_issue(IssueKind::PublicIssue, 1);
        s0.tier = Tier::S0;
        let mut merged = sample_issue(IssueKind::PublicIssue, 2);
        merged.status = IssueStatus::Merged;
        let private = sample_issue(IssueKind::PrivateSecurity, 3);
        contract.issues.insert(1, s0);
        contract.issues.insert(2, merged);
        contract.issues.insert(3, private);

        set_predecessor(accounts(3));
        assert_eq!(contract.mark_spam(1), Err(ContractError::InvalidState));
        assert_eq!(contract.mark_spam(2), Err(ContractError::InvalidState));
        assert_eq!(contract.mark_spam(3), Err(ContractError::InvalidState));
        set_predecessor(accounts(5));
        assert_eq!(contract.mark_spam(2), Err(ContractError::NotMaintainer));
    }

    #[test]
    fn get_issue_returns_the_full_issue_shape() {
        let mut contract = three_maintainer_contract();
        set_predecessor(accounts(1));
        let issue_id = contract
            .create_bounty(7, Tier::S2, U128(ONE_NEAR), Some(accounts(3)))
            .unwrap();

        let issue = contract.get_issue(issue_id).unwrap();
        assert_eq!(issue, contract.get_issues(0, 10)[0]);
        let json = serde_json::to_value(&issue).unwrap();
        for field in [
            "repo_id",
            "kind",
            "issue_number",
            "tier",
            "amount",
            "status",
            "creator",
            "claimants",
            "approvals",
            "intended_contributor",
            "merge_proof",
            "security",
            "s0",
            "payout_id",
            "blocked_reason",
            "cancelled_by",
            "created_at",
        ] {
            assert!(json.get(field).is_some(), "missing {field}");
        }
        assert!(json.get("private_ref").is_some());
        assert_eq!(contract.get_issue(99), None);
    }

    #[test]
    fn get_issue_redacts_undisclosed_private_security_fields() {
        let mut contract = BountyBoard::new(accounts(0), None);
        contract
            .issues
            .insert(1, sample_issue(IssueKind::PrivateSecurity, 3));

        let json = serde_json::to_string(&contract.get_issue(1).unwrap()).unwrap();
        assert!(json.contains("private_ref"));
        assert!(!json.contains("ghsa_id"));
        assert!(!json.contains("advisory_url"));
        assert!(!json.contains("researcher_github"));
    }

    fn count_event(event: &str) -> usize {
        let needle = format!("\"event\":\"{event}\"");
        get_logs()
            .iter()
            .filter(|log| log.contains(&needle))
            .count()
    }

    #[test]
    fn repeated_calls_do_not_duplicate_events() {
        let mut contract = three_maintainer_contract();
        set_predecessor(accounts(1));
        let issue_id = contract
            .create_bounty(1, Tier::S2, U128(ONE_NEAR), None)
            .unwrap();
        assert_eq!(count_event("bounty_created"), 1);

        set_predecessor(accounts(3));
        contract.claim(issue_id).unwrap();
        contract.claim(issue_id).unwrap();
        assert_eq!(count_event("bounty_claimed"), 1);

        set_predecessor(accounts(4));
        contract.approve(issue_id).unwrap();
        assert_eq!(count_event("bounty_approved"), 1);
        assert!(contract.approve(issue_id).is_err());
        assert_eq!(count_event("bounty_approved"), 1);

        contract.mark_spam(issue_id).unwrap();
        assert_eq!(count_event("spam_marked"), 1);
        assert!(contract.mark_spam(issue_id).is_err());
        assert_eq!(count_event("spam_marked"), 1);
    }

    #[test]
    fn bootstrap_state_uses_stored_ended_flag_after_maintainer_changes() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100 * ONE_NEAR, 100 * ONE_NEAR);
        assert_eq!(
            contract.get_bootstrap_state(),
            BootstrapState {
                active: true,
                maintainers_len: 1,
                threshold: 3,
                ended: false,
            }
        );

        contract.repos.get_mut(&REPO_ID).unwrap().bootstrap_ended = true;
        assert_eq!(
            contract.get_bootstrap_state(),
            BootstrapState {
                active: false,
                maintainers_len: 1,
                threshold: 3,
                ended: true,
            }
        );

        let repo = contract.repos.get_mut(&REPO_ID).unwrap();
        for account in [accounts(3), accounts(4)] {
            repo.maintainers.insert(
                account,
                MaintainerRecord {
                    since: 0,
                    bounties_approved: 0,
                    last_council_request_at: 0,
                },
            );
        }
        assert_eq!(
            contract.get_bootstrap_state(),
            BootstrapState {
                active: false,
                maintainers_len: 3,
                threshold: 3,
                ended: true,
            }
        );
    }

    #[test]
    fn add_repo_requires_dao() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        set_predecessor(accounts(1));

        assert_eq!(
            contract.add_repo("owner/repo".to_string(), vec![accounts(2)], accounts(3)),
            Err(ContractError::NotDao)
        );
        assert_eq!(contract.get_repo(), None);
    }

    #[test]
    fn add_repo_rejects_duplicate_repo() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        set_predecessor(accounts(0));

        assert_eq!(
            contract.add_repo("owner/repo".to_string(), vec![accounts(2)], accounts(3)),
            Ok(())
        );
        assert_eq!(
            contract.add_repo("other/repo".to_string(), vec![accounts(2)], accounts(3)),
            Err(ContractError::DuplicateRepo)
        );
    }

    #[test]
    fn add_repo_rejects_empty_maintainers() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        set_predecessor(accounts(0));

        assert_eq!(
            contract.add_repo("owner/repo".to_string(), Vec::new(), accounts(3)),
            Err(ContractError::EmptyMaintainers)
        );
    }

    #[test]
    fn add_repo_seeds_initial_state() {
        let mut builder = VMContextBuilder::new();
        builder
            .predecessor_account_id(accounts(0))
            .block_timestamp(12_345);
        testing_env!(builder.build());
        let mut contract = BountyBoard::new(accounts(0), None);

        contract
            .add_repo("owner/repo".to_string(), vec![accounts(2)], accounts(3))
            .unwrap();

        let repo = contract.get_repo().unwrap();
        assert_eq!(repo.github_repo, "owner/repo");
        assert_eq!(repo.oracle, accounts(3));
        assert_eq!(repo.budget, U128(0));
        assert_eq!(repo.committed, U128(0));
        assert_eq!(repo.daily_cap, U128(DEFAULT_DAILY_CAP_YOCTO));
        assert!(!repo.paused);
        assert!(!repo.bootstrap_ended);

        let record = repo.maintainers.get(&accounts(2)).unwrap();
        assert_eq!(record.since, 12_345);
        assert_eq!(record.bounties_approved, 0);
        assert_eq!(record.last_council_request_at, 0);
    }

    #[test]
    fn add_repo_dedupes_maintainers_and_sets_bootstrap_end() {
        context();
        let config = BoardConfig {
            bootstrap_until_maintainers: 2,
            ..Default::default()
        };
        let mut contract = BountyBoard::new(accounts(0), Some(config));
        set_predecessor(accounts(0));

        contract
            .add_repo(
                "owner/repo".to_string(),
                vec![accounts(2), accounts(2)],
                accounts(3),
            )
            .unwrap();
        assert_eq!(contract.get_maintainers().len(), 1);
        assert!(!contract.get_repo().unwrap().bootstrap_ended);

        let mut second = BountyBoard::new(
            accounts(0),
            Some(BoardConfig {
                bootstrap_until_maintainers: 2,
                ..Default::default()
            }),
        );
        set_predecessor(accounts(0));
        second
            .add_repo(
                "owner/repo".to_string(),
                vec![accounts(2), accounts(4)],
                accounts(3),
            )
            .unwrap();
        assert!(second.get_repo().unwrap().bootstrap_ended);
    }

    #[test]
    fn set_budget_requires_dao() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());
        set_predecessor(accounts(1));

        assert_eq!(
            contract.set_budget(REPO_ID, U128(100)),
            Err(ContractError::NotDao)
        );
    }

    #[test]
    fn set_budget_requires_existing_repo() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        set_predecessor(accounts(0));

        assert_eq!(
            contract.set_budget(REPO_ID, U128(100)),
            Err(ContractError::RepoNotFound)
        );
    }

    #[test]
    fn set_budget_cannot_drop_below_committed() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());
        set_predecessor(accounts(0));

        assert_eq!(
            contract.set_budget(REPO_ID, U128(39)),
            Err(ContractError::BudgetBelowCommitted)
        );
        assert_eq!(contract.get_repo().unwrap().budget, U128(100));

        contract.set_budget(REPO_ID, U128(40)).unwrap();
        assert_eq!(contract.get_repo().unwrap().budget, U128(40));
        assert_eq!(contract.get_budget().unwrap().available, U128(0));
    }

    #[test]
    fn pause_repo_requires_dao() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());
        set_predecessor(accounts(1));

        assert_eq!(
            contract.pause_repo(REPO_ID, true),
            Err(ContractError::NotDao)
        );
    }

    #[test]
    fn pause_repo_requires_existing_repo() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        set_predecessor(accounts(0));

        assert_eq!(
            contract.pause_repo(REPO_ID, true),
            Err(ContractError::RepoNotFound)
        );
    }

    #[test]
    fn pause_repo_only_changes_the_paused_flag() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());
        set_predecessor(accounts(0));

        let before = contract.get_repo().unwrap();
        contract.pause_repo(REPO_ID, true).unwrap();
        let paused = contract.get_repo().unwrap();

        assert!(paused.paused);
        assert_eq!(paused.budget, before.budget);
        assert_eq!(paused.committed, before.committed);
        assert_eq!(paused.daily_cap, before.daily_cap);
        assert_eq!(paused.maintainers, before.maintainers);
        assert_eq!(paused.oracle, before.oracle);

        contract.pause_repo(REPO_ID, false).unwrap();
        assert!(!contract.get_repo().unwrap().paused);
    }

    #[test]
    fn budget_view_computes_available_amounts() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);

        let mut repo = sample_repo();
        repo.budget = U128(100);
        repo.committed = U128(0);
        contract.repos.insert(REPO_ID, repo);
        let budget = contract.get_budget().unwrap();
        assert_eq!(budget.available, U128(100));

        let mut repo = sample_repo();
        repo.budget = U128(100);
        repo.committed = U128(40);
        contract.repos.insert(REPO_ID, repo);
        let budget = contract.get_budget().unwrap();
        assert_eq!(budget.budget, U128(100));
        assert_eq!(budget.committed, U128(40));
        assert_eq!(budget.available, U128(60));
        assert_eq!(budget.daily_cap, U128(25));
        assert!(!budget.paused);

        let mut repo = sample_repo();
        repo.budget = U128(100);
        repo.committed = U128(100);
        contract.repos.insert(REPO_ID, repo);
        assert_eq!(contract.get_budget().unwrap().available, U128(0));

        let mut repo = sample_repo();
        repo.budget = U128(100);
        repo.committed = U128(120);
        contract.repos.insert(REPO_ID, repo);
        assert_eq!(contract.get_budget().unwrap().available, U128(0));
    }

    #[test]
    fn budget_view_reflects_pause() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let mut repo = sample_repo();
        repo.paused = true;
        contract.repos.insert(REPO_ID, repo);

        assert!(contract.get_budget().unwrap().paused);
    }

    #[test]
    fn bootstrap_state_without_repo_is_inactive() {
        context();
        let contract = BountyBoard::new(accounts(0), None);
        let state = contract.get_bootstrap_state();

        assert!(!state.active);
        assert_eq!(state.maintainers_len, 0);
        assert_eq!(state.threshold, 3);
        assert!(!state.ended);
    }

    #[test]
    fn bootstrap_state_is_active_below_threshold() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        contract.repos.insert(REPO_ID, sample_repo());
        let state = contract.get_bootstrap_state();

        assert!(state.active);
        assert_eq!(state.maintainers_len, 1);
        assert_eq!(state.threshold, 3);
        assert!(!state.ended);
    }

    #[test]
    fn bootstrap_state_uses_stored_ended_flag() {
        context();
        let mut contract = BountyBoard::new(accounts(0), None);
        let mut repo = sample_repo();
        repo.bootstrap_ended = true;
        contract.repos.insert(REPO_ID, repo);

        let state = contract.get_bootstrap_state();
        assert!(!state.active);
        assert_eq!(state.maintainers_len, 1);
        assert!(state.ended);
    }

    #[test]
    fn bootstrap_state_respects_configured_threshold() {
        context();
        let config = BoardConfig {
            bootstrap_until_maintainers: 2,
            ..Default::default()
        };
        let mut contract = BountyBoard::new(accounts(0), Some(config));
        let mut repo = sample_repo();
        repo.maintainers.insert(
            accounts(4),
            MaintainerRecord {
                since: 0,
                bounties_approved: 0,
                last_council_request_at: 0,
            },
        );
        repo.bootstrap_ended = true;
        contract.repos.insert(REPO_ID, repo);

        let state = contract.get_bootstrap_state();
        assert!(!state.active);
        assert_eq!(state.maintainers_len, 2);
        assert_eq!(state.threshold, 2);
        assert!(state.ended);
    }
    fn merged_public_issue(tier: Tier, amount: u128, approvals: Vec<Approval>) -> Issue {
        let mut issue = sample_issue(IssueKind::PublicIssue, 7);
        issue.tier = tier;
        issue.amount = U128(amount);
        issue.status = IssueStatus::Merged;
        issue.creator = accounts(3);
        issue.approvals = approvals;
        issue.merge_proof = Some(MergeProof {
            pr_number: 11,
            pr_author: "alice".to_string(),
            commit: "abc123".to_string(),
            source: MergeSource::Oracle,
            merged_at: 0,
        });
        issue
    }

    fn maintainer_approval(approver: AccountId) -> Approval {
        Approval {
            approver,
            source: ApprovalSource::Maintainer,
            at: 0,
        }
    }

    fn pending_payout_issue() -> Issue {
        let mut issue = merged_public_issue(Tier::S2, 10, vec![maintainer_approval(accounts(1))]);
        issue.status = IssueStatus::PayoutPending;
        issue.payout_proposal_id = Some(7);
        issue.pending_payout = Some(PendingPayout {
            issue_id: 0,
            recipient: accounts(4),
            amount: U128(10),
            proof_kind: CompletionKind::PullRequest,
            proposal_id: Some(7),
            proposal_kind: payout_proposal_kind(0, 10),
        });
        issue
    }

    #[test]
    fn request_payout_rejects_s0_and_undisclosed_private_bounties() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);

        let mut s0 = merged_public_issue(Tier::S0, 10, vec![]);
        s0.amount = U128(10);
        contract.issues.insert(1, s0);
        assert_eq!(
            contract.request_payout(1).err(),
            Some(ContractError::InvalidState)
        );

        let mut private = sample_issue(IssueKind::PrivateSecurity, 2);
        private.status = IssueStatus::Merged;
        contract.issues.insert(2, private);
        assert_eq!(
            contract.request_payout(2).err(),
            Some(ContractError::SecurityNotDisclosed)
        );
    }

    #[test]
    fn request_payout_rejects_unmerged_issue() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        let mut issue = sample_issue(IssueKind::PublicIssue, 7);
        issue.status = IssueStatus::Approved;
        contract.issues.insert(1, issue);

        assert_eq!(
            contract.request_payout(1).err(),
            Some(ContractError::InvalidState)
        );
    }

    #[test]
    fn request_payout_requires_linked_recipient() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(
            1,
            merged_public_issue(Tier::S2, 10, vec![maintainer_approval(accounts(1))]),
        );

        assert_eq!(
            contract.request_payout(1).err(),
            Some(ContractError::IdentityNotLinked)
        );
    }

    #[test]
    fn request_payout_requires_sufficient_approvals() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.identities.insert("alice".to_string(), accounts(4));
        contract.issues.insert(
            1,
            merged_public_issue(Tier::S1, 10, vec![maintainer_approval(accounts(1))]),
        );

        assert_eq!(
            contract.request_payout(1).err(),
            Some(ContractError::InsufficientApprovals)
        );
    }

    #[test]
    fn request_payout_requires_dao_proposal_bond() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.identities.insert("alice".to_string(), accounts(4));
        contract.dao_params.proposal_bond = U128(ONE_NEAR);
        contract.issues.insert(
            1,
            merged_public_issue(Tier::S2, 10, vec![maintainer_approval(accounts(1))]),
        );
        contract.repos.get_mut(&REPO_ID).unwrap().committed = U128(10);

        assert_eq!(
            contract.request_payout(1).err(),
            Some(ContractError::InsufficientBond)
        );
    }

    #[test]
    fn request_payout_escalates_approver_who_is_the_recipient() {
        let mut contract = contract_with_repo(vec![accounts(1), accounts(4)], 100, 25);
        contract.identities.insert("alice".to_string(), accounts(4));
        contract.issues.insert(
            1,
            merged_public_issue(Tier::S2, 10, vec![maintainer_approval(accounts(4))]),
        );

        assert!(matches!(
            contract.request_payout(1),
            Ok(PromiseOrValue::Value(()))
        ));
        let issue = contract.get_issue(1).unwrap();
        assert_eq!(issue.status, IssueStatus::Escalated);
        assert_eq!(
            issue.blocked_reason.as_deref(),
            Some("final recipient conflicts with an approver")
        );
    }

    #[test]
    fn request_payout_escalates_s3_author_mismatch() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.identities.insert("alice".to_string(), accounts(4));
        let mut issue = merged_public_issue(
            Tier::S3,
            10,
            vec![Approval {
                approver: accounts(5),
                source: ApprovalSource::AutoS3,
                at: 0,
            }],
        );
        issue.intended_contributor = Some(accounts(5));
        contract.issues.insert(1, issue);

        assert!(matches!(
            contract.request_payout(1),
            Ok(PromiseOrValue::Value(()))
        ));
        let issue = contract.get_issue(1).unwrap();
        assert_eq!(issue.status, IssueStatus::Escalated);
        assert_eq!(
            issue.blocked_reason.as_deref(),
            Some("PR author does not match intended contributor")
        );
    }

    #[test]
    fn request_payout_records_recipient_and_proposal() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.identities.insert("alice".to_string(), accounts(4));
        contract.issues.insert(
            1,
            merged_public_issue(Tier::S2, 10, vec![maintainer_approval(accounts(1))]),
        );
        contract.repos.get_mut(&REPO_ID).unwrap().committed = U128(10);

        assert!(matches!(
            contract.request_payout(1),
            Ok(PromiseOrValue::Promise(_))
        ));
        let issue = contract.get_issue(1).unwrap();
        assert_eq!(issue.status, IssueStatus::PayoutRequested);
        let pending = issue.pending_payout.unwrap();
        assert_eq!(pending.recipient, accounts(4));
        assert_eq!(pending.amount, U128(10));
        assert_eq!(pending.proof_kind, CompletionKind::PullRequest);
        let ProposalKind::FunctionCall {
            receiver_id,
            actions,
        } = pending.proposal_kind;
        assert_eq!(receiver_id, env::current_account_id());
        assert_eq!(actions[0].method_name, "payout_near");
        assert_eq!(actions[0].deposit, U128(10));
    }

    #[test]
    fn payout_proposal_created_sets_pending_and_starts_vote() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        let mut issue = sample_issue(IssueKind::PublicIssue, 7);
        issue.status = IssueStatus::PayoutRequested;
        issue.pending_payout = Some(PendingPayout {
            issue_id: 0,
            recipient: accounts(4),
            amount: U128(10),
            proof_kind: CompletionKind::PullRequest,
            proposal_id: None,
            proposal_kind: payout_proposal_kind(0, 10),
        });
        contract.issues.insert(0, issue);

        assert!(matches!(
            contract.on_payout_proposal_created(0, Ok(9)),
            PromiseOrValue::Promise(_)
        ));
        let issue = contract.get_issue(0).unwrap();
        assert_eq!(issue.status, IssueStatus::PayoutPending);
        assert_eq!(issue.payout_proposal_id, Some(9));
        assert_eq!(
            issue
                .pending_payout
                .as_ref()
                .and_then(|pending| pending.proposal_id),
            Some(9)
        );
    }

    #[test]
    fn payout_proposal_creation_failure_reverts_to_merged() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        let mut issue = sample_issue(IssueKind::PublicIssue, 7);
        issue.status = IssueStatus::PayoutRequested;
        issue.pending_payout = Some(PendingPayout {
            issue_id: 0,
            recipient: accounts(4),
            amount: U128(10),
            proof_kind: CompletionKind::PullRequest,
            proposal_id: None,
            proposal_kind: payout_proposal_kind(0, 10),
        });
        contract.issues.insert(0, issue);

        assert!(matches!(
            contract.on_payout_proposal_created(0, Err(PromiseError::Failed)),
            PromiseOrValue::Value(())
        ));
        let issue = contract.get_issue(0).unwrap();
        assert_eq!(issue.status, IssueStatus::Merged);
        assert!(issue.pending_payout.is_none());
        assert_eq!(
            issue.blocked_reason.as_deref(),
            Some("DAO proposal creation failed")
        );
    }

    #[test]
    fn payout_vote_success_keeps_pending_and_emits_event() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(0, pending_payout_issue());

        contract.on_payout_vote_result(0, Ok(()));

        let issue = contract.get_issue(0).unwrap();
        assert_eq!(issue.status, IssueStatus::PayoutPending);
        assert!(issue.blocked_reason.is_none());
        let logs = get_logs();
        assert!(
            logs.iter()
                .any(|log| log.contains("\"event\":\"payout_requested\""))
        );
    }

    #[test]
    fn payout_vote_failure_sets_blocked_reason() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(0, pending_payout_issue());

        contract.on_payout_vote_result(0, Err(PromiseError::Failed));

        let issue = contract.get_issue(0).unwrap();
        assert_eq!(issue.status, IssueStatus::PayoutPending);
        assert_eq!(
            issue.blocked_reason.as_deref(),
            Some("DAO auto-vote failed")
        );
        let logs = get_logs();
        assert!(
            logs.iter()
                .any(|log| log.contains("\"event\":\"payout_request_failed\""))
        );
    }

    #[test]
    fn sync_payout_proposal_resets_terminal_status() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(0, pending_payout_issue());

        contract.on_sync_payout_proposal(
            0,
            Ok(ProposalOutput {
                id: 7,
                proposal: Proposal {
                    status: ProposalStatus::Rejected,
                    kind: payout_proposal_kind(0, 10),
                },
            }),
        );

        let issue = contract.get_issue(0).unwrap();
        assert_eq!(issue.status, IssueStatus::Merged);
        assert!(issue.pending_payout.is_none());
        assert_eq!(issue.payout_proposal_id, None);
        assert_eq!(
            issue.blocked_reason.as_deref(),
            Some("payout proposal rejected")
        );
    }

    #[test]
    fn retry_payout_vote_votes_when_proposal_is_in_progress() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(0, pending_payout_issue());

        assert!(matches!(
            contract.on_retry_payout_proposal(
                0,
                Ok(ProposalOutput {
                    id: 7,
                    proposal: Proposal {
                        status: ProposalStatus::InProgress,
                        kind: payout_proposal_kind(0, 10),
                    },
                }),
            ),
            PromiseOrValue::Promise(_)
        ));
    }

    #[test]
    fn finalize_payout_proposal_requires_dao() {
        let mut contract = contract_with_repo(vec![accounts(1)], 100, 25);
        contract.issues.insert(0, pending_payout_issue());

        set_predecessor(accounts(1));
        assert_eq!(
            contract.finalize_payout_proposal(0).err(),
            Some(ContractError::NotDao)
        );

        set_predecessor(accounts(0));
        assert!(contract.finalize_payout_proposal(0).is_ok());
    }
}
