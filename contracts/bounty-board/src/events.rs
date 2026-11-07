use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near};
use serde::Serialize;

use crate::types::{IssueId, IssueStatus, MergeSource, RepoId, Tier};

pub const EVENT_STANDARD: &str = "bountyboard";
pub const EVENT_VERSION: &str = "1.0.0";

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoAdded {
    pub repo_id: RepoId,
    pub github_repo: String,
    pub github_repo_id: u64,
    pub verification_source: String,
    pub maintainers: Vec<AccountId>,
    pub oracle: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoBudgetSet {
    pub repo_id: RepoId,
    pub budget: U128,
    pub committed: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoPaused {
    pub repo_id: RepoId,
    pub paused: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoOracleSet {
    pub repo_id: RepoId,
    pub oracle: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilMaintainersSynced {
    pub added: Vec<AccountId>,
    pub removed: Vec<AccountId>,
    pub maintainers_len: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyCreated {
    pub issue_id: IssueId,
    pub issue_number: u64,
    pub tier: Tier,
    pub amount: U128,
    pub creator: AccountId,
    pub contributor: Option<AccountId>,
    pub status: IssueStatus,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyApproved {
    pub issue_id: IssueId,
    pub approver: AccountId,
    pub source: crate::types::ApprovalSource,
    pub status: IssueStatus,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpamMarked {
    pub issue_id: IssueId,
    pub maintainer: AccountId,
    pub released: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyClaimed {
    pub issue_id: IssueId,
    pub claimant: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutRequested {
    pub issue_id: IssueId,
    pub proposal_id: u64,
    pub recipient: AccountId,
    pub amount: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutRequestFailed {
    pub issue_id: IssueId,
    pub reason: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutCompleted {
    pub issue_id: IssueId,
    pub payout_id: u64,
    pub recipient: AccountId,
    pub amount: U128,
    pub tier: Tier,
    pub points: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutFailed {
    pub issue_id: IssueId,
    pub payout_id: u64,
    pub recipient: AccountId,
    pub amount: U128,
    pub tier: Tier,
    pub points: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutRefunded {
    pub issue_id: IssueId,
    pub payout_id: u64,
    pub recipient: AccountId,
    pub amount: U128,
    pub tier: Tier,
    pub points: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0ProposalCreated {
    pub issue_id: IssueId,
    pub proposal_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0ProposalFailed {
    pub issue_id: IssueId,
    pub reason: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0BountyRegistered {
    pub issue_id: IssueId,
    pub bounty_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0BountyReplaced {
    pub issue_id: IssueId,
    pub bounty_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyDoneVoted {
    pub issue_id: IssueId,
    pub proposal_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0VerificationFailed {
    pub issue_id: IssueId,
    pub bounty_id: u64,
    pub reason: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaintainerPromoted {
    pub account: AccountId,
    pub since: near_sdk::Timestamp,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PromotionVetoed {
    pub account: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaintainerRemoved {
    pub account: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilPromotionRequested {
    pub account: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilPromotionApproved {
    pub account: AccountId,
    pub proposal_id: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityLinked {
    pub handle: String,
    pub account: AccountId,
    pub github_user_id: Option<u64>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityUnlinked {
    pub handle: String,
    pub account: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrivateBountyCreated {
    pub issue_id: IssueId,
    pub tier: Tier,
    pub amount: U128,
    pub private_ref: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecurityFixed {
    pub issue_id: IssueId,
    pub ghsa_id: String,
    pub advisory_url: String,
    pub researcher_github: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecurityApprovalConflict {
    pub issue_id: IssueId,
    pub approver: AccountId,
    pub reason: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PrivateBountyCancelled {
    pub issue_id: IssueId,
    pub maintainer: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyMerged {
    pub issue_id: IssueId,
    pub pr_number: u64,
    pub pr_author_handle: String,
    pub pr_author_account: Option<AccountId>,
    pub commit: String,
    pub source: MergeSource,
}

#[derive(Serialize)]
struct EventEnvelope<'a, T> {
    standard: &'a str,
    version: &'a str,
    event: &'a str,
    data: &'a T,
}

fn event_json<T: Serialize>(event: &str, data: &T) -> String {
    let envelope = EventEnvelope {
        standard: EVENT_STANDARD,
        version: EVENT_VERSION,
        event,
        data,
    };
    format!(
        "EVENT_JSON:{}",
        serde_json::to_string(&envelope).unwrap_or_default()
    )
}

fn emit<T: Serialize>(event: &str, data: &T) {
    env::log_str(&event_json(event, data));
}

pub fn repo_added(
    repo_id: RepoId,
    github_repo: String,
    github_repo_id: u64,
    verification_source: String,
    maintainers: Vec<AccountId>,
    oracle: AccountId,
) {
    emit(
        "repo_added",
        &RepoAdded {
            repo_id,
            github_repo,
            github_repo_id,
            verification_source,
            maintainers,
            oracle,
        },
    );
}

pub fn repo_oracle_set(repo_id: RepoId, oracle: AccountId) {
    emit("repo_oracle_set", &RepoOracleSet { repo_id, oracle });
}

pub fn council_maintainers_synced(
    added: Vec<AccountId>,
    removed: Vec<AccountId>,
    maintainers_len: u32,
) {
    emit(
        "council_maintainers_synced",
        &CouncilMaintainersSynced {
            added,
            removed,
            maintainers_len,
        },
    );
}

pub fn repo_budget_set(repo_id: RepoId, budget: u128, committed: u128) {
    emit(
        "repo_budget_set",
        &RepoBudgetSet {
            repo_id,
            budget: U128(budget),
            committed: U128(committed),
        },
    );
}

pub fn repo_paused(repo_id: RepoId, paused: bool) {
    emit("repo_paused", &RepoPaused { repo_id, paused });
}

pub fn bounty_claimed(issue_id: IssueId, claimant: AccountId) {
    emit("bounty_claimed", &BountyClaimed { issue_id, claimant });
}

pub fn spam_marked(issue_id: IssueId, maintainer: AccountId, released: u128) {
    emit(
        "spam_marked",
        &SpamMarked {
            issue_id,
            maintainer,
            released: U128(released),
        },
    );
}

pub fn identity_linked(handle: String, account: AccountId, github_user_id: Option<u64>) {
    emit(
        "identity_linked",
        &IdentityLinked {
            handle,
            account,
            github_user_id,
        },
    );
}

pub fn identity_unlinked(handle: String, account: AccountId) {
    emit("identity_unlinked", &IdentityUnlinked { handle, account });
}

pub fn bounty_merged(
    issue_id: IssueId,
    pr_number: u64,
    pr_author_handle: String,
    pr_author_account: Option<AccountId>,
    commit: String,
    source: MergeSource,
) {
    emit(
        "bounty_merged",
        &BountyMerged {
            issue_id,
            pr_number,
            pr_author_handle,
            pr_author_account,
            commit,
            source,
        },
    );
}

pub fn private_bounty_created(issue_id: IssueId, tier: Tier, amount: u128, private_ref: String) {
    emit(
        "private_bounty_created",
        &PrivateBountyCreated {
            issue_id,
            tier,
            amount: U128(amount),
            private_ref,
        },
    );
}

pub fn security_fixed(
    issue_id: IssueId,
    ghsa_id: String,
    advisory_url: String,
    researcher_github: String,
) {
    emit(
        "security_fixed",
        &SecurityFixed {
            issue_id,
            ghsa_id,
            advisory_url,
            researcher_github,
        },
    );
}

pub fn security_approval_conflict(issue_id: IssueId, approver: AccountId, reason: String) {
    emit(
        "security_approval_conflict",
        &SecurityApprovalConflict {
            issue_id,
            approver,
            reason,
        },
    );
}

pub fn private_bounty_cancelled(issue_id: IssueId, maintainer: AccountId) {
    emit(
        "private_bounty_cancelled",
        &PrivateBountyCancelled {
            issue_id,
            maintainer,
        },
    );
}

pub fn council_promotion_requested(account: AccountId) {
    emit(
        "council_promotion_requested",
        &CouncilPromotionRequested { account },
    );
}

pub fn council_promotion_approved(account: AccountId, proposal_id: u64) {
    emit(
        "council_promotion_approved",
        &CouncilPromotionApproved {
            account,
            proposal_id,
        },
    );
}

pub fn maintainer_promoted(account: AccountId, since: near_sdk::Timestamp) {
    emit(
        "maintainer_promoted",
        &MaintainerPromoted { account, since },
    );
}

pub fn promotion_vetoed(account: AccountId) {
    emit("promotion_vetoed", &PromotionVetoed { account });
}

pub fn maintainer_removed(account: AccountId) {
    emit("maintainer_removed", &MaintainerRemoved { account });
}

pub fn s0_proposal_created(issue_id: IssueId, proposal_id: u64) {
    emit(
        "s0_proposal_created",
        &S0ProposalCreated {
            issue_id,
            proposal_id,
        },
    );
}

pub fn s0_proposal_failed(issue_id: IssueId, reason: String) {
    emit("s0_proposal_failed", &S0ProposalFailed { issue_id, reason });
}

pub fn s0_bounty_registered(issue_id: IssueId, bounty_id: u64) {
    emit(
        "s0_bounty_registered",
        &S0BountyRegistered {
            issue_id,
            bounty_id,
        },
    );
}

pub fn s0_bounty_replaced(issue_id: IssueId, bounty_id: u64) {
    emit(
        "s0_bounty_replaced",
        &S0BountyReplaced {
            issue_id,
            bounty_id,
        },
    );
}

pub fn bounty_done_voted(issue_id: IssueId, proposal_id: u64) {
    emit(
        "bounty_done_voted",
        &BountyDoneVoted {
            issue_id,
            proposal_id,
        },
    );
}

pub fn s0_verification_failed(issue_id: IssueId, bounty_id: u64, reason: String) {
    emit(
        "s0_verification_failed",
        &S0VerificationFailed {
            issue_id,
            bounty_id,
            reason,
        },
    );
}

#[allow(clippy::too_many_arguments)]
pub fn payout_completed(
    issue_id: IssueId,
    payout_id: u64,
    recipient: AccountId,
    amount: u128,
    tier: Tier,
    points: u32,
) {
    emit(
        "payout_completed",
        &PayoutCompleted {
            issue_id,
            payout_id,
            recipient,
            amount: U128(amount),
            tier,
            points,
        },
    );
}

#[allow(clippy::too_many_arguments)]
pub fn payout_failed(
    issue_id: IssueId,
    payout_id: u64,
    recipient: AccountId,
    amount: u128,
    tier: Tier,
    points: u32,
) {
    emit(
        "payout_failed",
        &PayoutFailed {
            issue_id,
            payout_id,
            recipient,
            amount: U128(amount),
            tier,
            points,
        },
    );
}

#[allow(clippy::too_many_arguments)]
pub fn payout_refunded(
    issue_id: IssueId,
    payout_id: u64,
    recipient: AccountId,
    amount: u128,
    tier: Tier,
    points: u32,
) {
    emit(
        "payout_refunded",
        &PayoutRefunded {
            issue_id,
            payout_id,
            recipient,
            amount: U128(amount),
            tier,
            points,
        },
    );
}

pub fn payout_requested(issue_id: IssueId, proposal_id: u64, recipient: AccountId, amount: u128) {
    emit(
        "payout_requested",
        &PayoutRequested {
            issue_id,
            proposal_id,
            recipient,
            amount: U128(amount),
        },
    );
}

pub fn payout_request_failed(issue_id: IssueId, reason: String) {
    emit(
        "payout_request_failed",
        &PayoutRequestFailed { issue_id, reason },
    );
}

pub fn bounty_approved(
    issue_id: IssueId,
    approver: AccountId,
    source: crate::types::ApprovalSource,
    status: IssueStatus,
) {
    emit(
        "bounty_approved",
        &BountyApproved {
            issue_id,
            approver,
            source,
            status,
        },
    );
}

#[allow(clippy::too_many_arguments)]
pub fn bounty_created(
    issue_id: IssueId,
    issue_number: u64,
    tier: Tier,
    amount: u128,
    creator: AccountId,
    contributor: Option<AccountId>,
    status: IssueStatus,
) {
    emit(
        "bounty_created",
        &BountyCreated {
            issue_id,
            issue_number,
            tier,
            amount: U128(amount),
            creator,
            contributor,
            status,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::accounts;

    fn parse_event(log: &str) -> serde_json::Value {
        let payload = log.strip_prefix("EVENT_JSON:").unwrap();
        serde_json::from_str(payload).unwrap()
    }

    #[test]
    fn repo_added_event_shape() {
        let log = event_json(
            "repo_added",
            &RepoAdded {
                repo_id: 0,
                github_repo: "owner/repo".to_string(),
                github_repo_id: 42,
                verification_source: "github_app".to_string(),
                maintainers: vec![accounts(1)],
                oracle: accounts(2),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["standard"], EVENT_STANDARD);
        assert_eq!(value["version"], EVENT_VERSION);
        assert_eq!(value["event"], "repo_added");
        assert_eq!(value["data"]["repo_id"], 0);
        assert_eq!(value["data"]["github_repo"], "owner/repo");
        assert_eq!(value["data"]["github_repo_id"], 42);
        assert_eq!(value["data"]["verification_source"], "github_app");
        assert_eq!(value["data"]["maintainers"][0], accounts(1).to_string());
        assert_eq!(value["data"]["oracle"], accounts(2).to_string());
    }

    #[test]
    fn bounty_created_event_shape() {
        let log = event_json(
            "bounty_created",
            &BountyCreated {
                issue_id: 1,
                issue_number: 7,
                tier: Tier::S3,
                amount: U128(10),
                creator: accounts(1),
                contributor: Some(accounts(2)),
                status: IssueStatus::Approved,
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "bounty_created");
        assert_eq!(value["data"]["issue_id"], 1);
        assert_eq!(value["data"]["issue_number"], 7);
        assert_eq!(value["data"]["tier"], "S3");
        assert_eq!(value["data"]["amount"], "10");
        assert_eq!(value["data"]["contributor"], accounts(2).to_string());
        assert_eq!(value["data"]["status"], "Approved");
    }

    #[test]
    fn bounty_approved_event_shape() {
        let log = event_json(
            "bounty_approved",
            &BountyApproved {
                issue_id: 1,
                approver: accounts(1),
                source: crate::types::ApprovalSource::Maintainer,
                status: IssueStatus::Approved,
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "bounty_approved");
        assert_eq!(value["data"]["approver"], accounts(1).to_string());
        assert_eq!(value["data"]["source"], "Maintainer");
        assert_eq!(value["data"]["status"], "Approved");
    }

    #[test]
    fn bounty_claimed_event_shape() {
        let log = event_json(
            "bounty_claimed",
            &BountyClaimed {
                issue_id: 1,
                claimant: accounts(1),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "bounty_claimed");
        assert_eq!(value["data"]["claimant"], accounts(1).to_string());
    }

    #[test]
    fn spam_marked_event_shape() {
        let log = event_json(
            "spam_marked",
            &SpamMarked {
                issue_id: 1,
                maintainer: accounts(1),
                released: U128(10),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "spam_marked");
        assert_eq!(value["data"]["maintainer"], accounts(1).to_string());
        assert_eq!(value["data"]["released"], "10");
    }

    #[test]
    fn repo_budget_event_uses_u128_strings() {
        let log = event_json(
            "repo_budget_set",
            &RepoBudgetSet {
                repo_id: 0,
                budget: U128(100),
                committed: U128(40),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["data"]["budget"], "100");
        assert_eq!(value["data"]["committed"], "40");
    }

    #[test]
    fn repo_paused_event_shape() {
        let log = event_json(
            "repo_paused",
            &RepoPaused {
                repo_id: 0,
                paused: true,
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "repo_paused");
        assert_eq!(value["data"]["paused"], true);
    }
    #[test]
    fn payout_requested_event_shape() {
        let log = event_json(
            "payout_requested",
            &PayoutRequested {
                issue_id: 3,
                proposal_id: 9,
                recipient: accounts(4),
                amount: U128(10),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "payout_requested");
        assert_eq!(value["data"]["issue_id"], 3);
        assert_eq!(value["data"]["proposal_id"], 9);
        assert_eq!(value["data"]["recipient"], accounts(4).to_string());
        assert_eq!(value["data"]["amount"], "10");
    }

    #[test]
    fn payout_request_failed_event_shape() {
        let log = event_json(
            "payout_request_failed",
            &PayoutRequestFailed {
                issue_id: 3,
                reason: "payout proposal expired".to_string(),
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "payout_request_failed");
        assert_eq!(value["data"]["issue_id"], 3);
        assert_eq!(value["data"]["reason"], "payout proposal expired");
    }
    #[test]
    fn payout_completed_event_shape() {
        let log = event_json(
            "payout_completed",
            &PayoutCompleted {
                issue_id: 3,
                payout_id: 5,
                recipient: accounts(4),
                amount: U128(10),
                tier: Tier::S2,
                points: 3,
            },
        );
        let value = parse_event(&log);

        assert_eq!(value["event"], "payout_completed");
        assert_eq!(value["data"]["issue_id"], 3);
        assert_eq!(value["data"]["payout_id"], 5);
        assert_eq!(value["data"]["recipient"], accounts(4).to_string());
        assert_eq!(value["data"]["amount"], "10");
        assert_eq!(value["data"]["tier"], "S2");
        assert_eq!(value["data"]["points"], 3);
    }

    #[test]
    fn payout_failed_and_refunded_event_shapes() {
        let failed = event_json(
            "payout_failed",
            &PayoutFailed {
                issue_id: 3,
                payout_id: 5,
                recipient: accounts(4),
                amount: U128(10),
                tier: Tier::S2,
                points: 3,
            },
        );
        let failed_value = parse_event(&failed);
        assert_eq!(failed_value["event"], "payout_failed");
        assert_eq!(failed_value["data"]["payout_id"], 5);

        let refunded = event_json(
            "payout_refunded",
            &PayoutRefunded {
                issue_id: 3,
                payout_id: 5,
                recipient: accounts(4),
                amount: U128(10),
                tier: Tier::S2,
                points: 3,
            },
        );
        let refunded_value = parse_event(&refunded);
        assert_eq!(refunded_value["event"], "payout_refunded");
        assert_eq!(refunded_value["data"]["amount"], "10");
    }
    #[test]
    fn s0_event_shapes() {
        let created = parse_event(&event_json(
            "s0_proposal_created",
            &S0ProposalCreated {
                issue_id: 3,
                proposal_id: 7,
            },
        ));
        assert_eq!(created["data"]["issue_id"], 3);
        assert_eq!(created["data"]["proposal_id"], 7);

        let registered = parse_event(&event_json(
            "s0_bounty_registered",
            &S0BountyRegistered {
                issue_id: 3,
                bounty_id: 5,
            },
        ));
        assert_eq!(registered["data"]["bounty_id"], 5);

        let replaced = parse_event(&event_json(
            "s0_bounty_replaced",
            &S0BountyReplaced {
                issue_id: 3,
                bounty_id: 6,
            },
        ));
        assert_eq!(replaced["data"]["bounty_id"], 6);

        let voted = parse_event(&event_json(
            "bounty_done_voted",
            &BountyDoneVoted {
                issue_id: 3,
                proposal_id: 9,
            },
        ));
        assert_eq!(voted["data"]["proposal_id"], 9);
    }
    #[test]
    fn maintainer_event_shapes() {
        let promoted = parse_event(&event_json(
            "maintainer_promoted",
            &MaintainerPromoted {
                account: accounts(5),
                since: 42,
            },
        ));
        assert_eq!(promoted["data"]["account"], accounts(5).to_string());
        assert_eq!(promoted["data"]["since"], 42);

        let vetoed = parse_event(&event_json(
            "promotion_vetoed",
            &PromotionVetoed {
                account: accounts(5),
            },
        ));
        assert_eq!(vetoed["data"]["account"], accounts(5).to_string());

        let removed = parse_event(&event_json(
            "maintainer_removed",
            &MaintainerRemoved {
                account: accounts(5),
            },
        ));
        assert_eq!(removed["data"]["account"], accounts(5).to_string());
    }
}
