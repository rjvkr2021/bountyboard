use std::collections::BTreeMap;

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, PanicOnDefault, env, near};

pub mod access;
pub mod errors;
pub mod events;
pub mod state;
pub mod types;

use crate::errors::ContractError;
use crate::state::StorageKey;
use crate::types::{
    BoardConfig, BudgetView, Candidate, CouncilRequest, DEFAULT_DAILY_CAP_YOCTO, DaoParams, Issue,
    IssueId, MaintainerRecord, PayoutId, PayoutRecord, PrivateRef, REPO_ID, Repo, RepoId,
    Reputation,
};

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
                budget: 0,
                committed: 0,
                daily_cap: DEFAULT_DAILY_CAP_YOCTO,
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
        if amount.0 < repo.committed {
            return Err(ContractError::BudgetBelowCommitted);
        }
        repo.budget = amount.0;
        let committed = repo.committed;
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
            budget: U128(repo.budget),
            committed: U128(repo.committed),
            available: U128(repo.budget.saturating_sub(repo.committed)),
            daily_cap: U128(repo.daily_cap),
            paused: repo.paused,
        })
    }

    pub fn get_maintainers(&self) -> BTreeMap<AccountId, MaintainerRecord> {
        self.repos
            .get(&REPO_ID)
            .map(|repo| repo.maintainers.clone())
            .unwrap_or_default()
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

    pub fn get_issue_by_private_ref(&self, private_ref: String) -> Option<Issue> {
        self.private_refs
            .get(&private_ref)
            .and_then(|issue_id| self.issues.get(issue_id))
            .cloned()
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
    use crate::types::{Approval, IssueKind, IssueStatus, PayoutProof, PayoutStatus, Tier};
    use near_sdk::test_utils::{VMContextBuilder, accounts};
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
            budget: 100,
            committed: 40,
            daily_cap: 25,
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
            amount: 10,
            status: IssueStatus::PendingApproval,
            creator: accounts(0),
            claimants: Vec::new(),
            approvals: Vec::<Approval>::new(),
            intended_contributor: None,
            merge_proof: None,
            security: None,
            s0: None,
            payout_id: None,
            blocked_reason: None,
            created_at: 0,
        }
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
                amount: 10,
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
        assert_eq!(repo.budget, 0);
        assert_eq!(repo.committed, 0);
        assert_eq!(repo.daily_cap, DEFAULT_DAILY_CAP_YOCTO);
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
        assert_eq!(contract.get_repo().unwrap().budget, 100);

        contract.set_budget(REPO_ID, U128(40)).unwrap();
        assert_eq!(contract.get_repo().unwrap().budget, 40);
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
        repo.budget = 100;
        repo.committed = 0;
        contract.repos.insert(REPO_ID, repo);
        let budget = contract.get_budget().unwrap();
        assert_eq!(budget.available, U128(100));

        let mut repo = sample_repo();
        repo.budget = 100;
        repo.committed = 40;
        contract.repos.insert(REPO_ID, repo);
        let budget = contract.get_budget().unwrap();
        assert_eq!(budget.budget, U128(100));
        assert_eq!(budget.committed, U128(40));
        assert_eq!(budget.available, U128(60));
        assert_eq!(budget.daily_cap, U128(25));
        assert!(!budget.paused);

        let mut repo = sample_repo();
        repo.budget = 100;
        repo.committed = 100;
        contract.repos.insert(REPO_ID, repo);
        assert_eq!(contract.get_budget().unwrap().available, U128(0));

        let mut repo = sample_repo();
        repo.budget = 100;
        repo.committed = 120;
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
}
