use std::collections::BTreeMap;

use near_sdk::json_types::U128;
use near_sdk::{AccountId, Timestamp, near};

use crate::dao::ProposalKind;

pub type RepoId = u64;
pub type IssueId = u64;
pub type PayoutId = u64;
pub type PrivateRef = String;

pub const REPO_ID: RepoId = 0;

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const S3_AUTO_APPROVE_MAX_YOCTO: u128 = 25 * ONE_NEAR;
pub const S3_AUTO_MIN_COMPLETED: u64 = 3;
pub const MAX_CLAIMANTS: usize = 32;
pub const DEFAULT_DAILY_CAP_YOCTO: u128 = 25 * ONE_NEAR;
pub const DAY_SECS: u64 = 86_400;
pub const WEEK_SECS: u64 = 7 * DAY_SECS;
pub const DEFAULT_BOOTSTRAP_UNTIL_MAINTAINERS: u32 = 3;
pub const DEFAULT_COUNCIL_PROMOTION_MIN_APPROVALS: u32 = 3;
pub const DEFAULT_COUNCIL_ROLE_NAME: &str = "council";
pub const GAS_FOR_PAYOUT: u64 = 30_000_000_000_000;
pub const GAS_FOR_PAYOUT_CALLBACK: u64 = 20_000_000_000_000;
pub const GAS_FOR_PAYOUT_TRANSFER_CALLBACK: u64 = 20_000_000_000_000;
pub const CANDIDATE_POINTS: u32 = 10;
pub const CANDIDATE_COMPLETED: u64 = 3;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tier {
    S0,
    S1,
    S2,
    S3,
}

impl Tier {
    pub fn points(self) -> u32 {
        match self {
            Tier::S0 => 8,
            Tier::S1 => 5,
            Tier::S2 => 3,
            Tier::S3 => 1,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Tier::S0 => "S0",
            Tier::S1 => "S1",
            Tier::S2 => "S2",
            Tier::S3 => "S3",
        }
    }

    pub fn max_s3_auto_amount(self) -> u128 {
        match self {
            Tier::S3 => S3_AUTO_APPROVE_MAX_YOCTO,
            _ => 0,
        }
    }

    pub fn required_maintainer_approvals(self) -> u32 {
        match self {
            Tier::S0 => 0,
            Tier::S1 => 2,
            Tier::S2 => 1,
            Tier::S3 => 1,
        }
    }

    pub fn private_required_approvals(self) -> u32 {
        match self {
            Tier::S0 => 0,
            Tier::S1 => 2,
            Tier::S2 => 1,
            Tier::S3 => 1,
        }
    }

    pub fn is_s0(self) -> bool {
        matches!(self, Tier::S0)
    }

    pub fn is_s3(self) -> bool {
        matches!(self, Tier::S3)
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueStatus {
    PendingApproval,
    Approved,
    Merged,
    PayoutRequested,
    PayoutPending,
    PayoutProcessing,
    PayoutFailed,
    Paid,
    Escalated,
    Cancelled,
    Refunded,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueKind {
    PublicIssue,
    PrivateSecurity,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MergeSource {
    Oracle,
    Manual,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApprovalSource {
    AutoS3,
    Maintainer,
    Council,
    BootstrapCouncil,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayoutStatus {
    Processing,
    Paid,
    Failed,
    Refunded,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BoardConfig {
    pub bootstrap_until_maintainers: u32,
    pub maintainer_challenge_secs: u64,
    pub council_promotion_min_tenure_secs: u64,
    pub council_promotion_delay_secs: u64,
    pub council_promotion_min_approvals: u32,
    pub council_role_name: String,
}

impl Default for BoardConfig {
    fn default() -> Self {
        Self {
            bootstrap_until_maintainers: DEFAULT_BOOTSTRAP_UNTIL_MAINTAINERS,
            maintainer_challenge_secs: WEEK_SECS,
            council_promotion_min_tenure_secs: WEEK_SECS,
            council_promotion_delay_secs: WEEK_SECS,
            council_promotion_min_approvals: DEFAULT_COUNCIL_PROMOTION_MIN_APPROVALS,
            council_role_name: DEFAULT_COUNCIL_ROLE_NAME.to_string(),
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaintainerRecord {
    pub since: Timestamp,
    pub bounties_approved: u64,
    pub last_council_request_at: Timestamp,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Repo {
    pub github_repo: String,
    pub maintainers: BTreeMap<AccountId, MaintainerRecord>,
    pub oracle: AccountId,
    pub budget: U128,
    pub committed: U128,
    pub daily_cap: U128,
    pub paused: bool,
    pub bootstrap_ended: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Approval {
    pub approver: AccountId,
    pub source: ApprovalSource,
    pub at: Timestamp,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MergeProof {
    pub pr_number: u64,
    pub pr_author: String,
    pub commit: String,
    pub source: MergeSource,
    pub merged_at: Timestamp,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SecurityDisclosure {
    pub ghsa_id: String,
    pub advisory_url: String,
    pub researcher_github: String,
    pub disclosed_at: Timestamp,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct S0State {
    pub proposal_id: Option<u64>,
    pub native_bounty_id: Option<u64>,
    pub bounty_done_proposal_id: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Issue {
    pub repo_id: RepoId,
    pub kind: IssueKind,
    pub issue_number: Option<u64>,
    pub private_ref: Option<PrivateRef>,
    pub tier: Tier,
    pub amount: U128,
    pub status: IssueStatus,
    pub creator: AccountId,
    pub claimants: Vec<AccountId>,
    pub approvals: Vec<Approval>,
    pub intended_contributor: Option<AccountId>,
    pub merge_proof: Option<MergeProof>,
    pub security: Option<SecurityDisclosure>,
    pub s0: Option<S0State>,
    pub payout_id: Option<PayoutId>,
    pub payout_proposal_id: Option<u64>,
    pub pending_payout: Option<PendingPayout>,
    pub blocked_reason: Option<String>,
    pub cancelled_by: Option<AccountId>,
    pub created_at: Timestamp,
}

impl Issue {
    pub fn has_exactly_one_identifier(&self) -> bool {
        self.issue_number.is_some() ^ self.private_ref.is_some()
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompletionKind {
    PullRequest,
    AdvisoryPublication,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingPayout {
    pub issue_id: IssueId,
    pub recipient: AccountId,
    pub amount: U128,
    pub proof_kind: CompletionKind,
    pub proposal_id: Option<u64>,
    pub proposal_kind: ProposalKind,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PayoutProof {
    PullRequest {
        pr_number: u64,
        commit: String,
    },
    AdvisoryPublication {
        ghsa_id: String,
        advisory_url: String,
    },
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PayoutRecord {
    pub issue_id: IssueId,
    pub recipient: AccountId,
    pub amount: U128,
    pub tier: Tier,
    pub points: u32,
    pub status: PayoutStatus,
    pub attempt: u32,
    pub proof: PayoutProof,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Reputation {
    pub completed: u64,
    pub total_earned: U128,
    pub points: u32,
    pub has_s1_or_s0: bool,
    pub payout_ids: Vec<PayoutId>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Candidate {
    pub account: AccountId,
    pub created_at: Timestamp,
    pub challenge_until: Timestamp,
    pub vetoed: bool,
    pub points_at_creation: u32,
    pub completed_at_creation: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilRequest {
    pub last_proposal_at: Timestamp,
    pub active_proposal_id: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DaoParams {
    pub proposal_bond: U128,
    pub bounty_bond: U128,
    pub proposal_period: u64,
    pub bounty_forgiveness_period: u64,
    pub synced_at: Timestamp,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BootstrapState {
    pub active: bool,
    pub maintainers_len: u32,
    pub threshold: u32,
    pub ended: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BudgetView {
    pub budget: U128,
    pub committed: U128,
    pub available: U128,
    pub daily_cap: U128,
    pub paused: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn points_match_tiers() {
        assert_eq!(Tier::S0.points(), 8);
        assert_eq!(Tier::S1.points(), 5);
        assert_eq!(Tier::S2.points(), 3);
        assert_eq!(Tier::S3.points(), 1);
    }

    #[test]
    fn labels_are_stable() {
        assert_eq!(Tier::S0.label(), "S0");
        assert_eq!(Tier::S1.label(), "S1");
        assert_eq!(Tier::S2.label(), "S2");
        assert_eq!(Tier::S3.label(), "S3");
    }

    #[test]
    fn json_names_are_stable() {
        assert_eq!(serde_json::to_string(&Tier::S0).unwrap(), "\"S0\"");
        assert_eq!(serde_json::to_string(&Tier::S1).unwrap(), "\"S1\"");
        assert_eq!(serde_json::to_string(&Tier::S2).unwrap(), "\"S2\"");
        assert_eq!(serde_json::to_string(&Tier::S3).unwrap(), "\"S3\"");
    }

    #[test]
    fn maintainer_approval_thresholds() {
        assert_eq!(Tier::S0.required_maintainer_approvals(), 0);
        assert_eq!(Tier::S1.required_maintainer_approvals(), 2);
        assert_eq!(Tier::S2.required_maintainer_approvals(), 1);
        assert_eq!(Tier::S3.required_maintainer_approvals(), 1);
    }

    #[test]
    fn private_approval_thresholds() {
        assert_eq!(Tier::S0.private_required_approvals(), 0);
        assert_eq!(Tier::S1.private_required_approvals(), 2);
        assert_eq!(Tier::S2.private_required_approvals(), 1);
        assert_eq!(Tier::S3.private_required_approvals(), 1);
    }

    #[test]
    fn only_s3_has_an_auto_approval_cap() {
        assert_eq!(Tier::S3.max_s3_auto_amount(), S3_AUTO_APPROVE_MAX_YOCTO);
        assert_eq!(Tier::S3.max_s3_auto_amount(), 25 * ONE_NEAR);
        assert_eq!(Tier::S0.max_s3_auto_amount(), 0);
        assert_eq!(Tier::S1.max_s3_auto_amount(), 0);
        assert_eq!(Tier::S2.max_s3_auto_amount(), 0);
    }

    #[test]
    fn private_s3_never_auto_approves() {
        assert_eq!(Tier::S3.private_required_approvals(), 1);
        assert!(Tier::S3.private_required_approvals() > 0);
    }

    #[test]
    fn tier_helpers() {
        assert!(Tier::S0.is_s0());
        assert!(!Tier::S1.is_s0());
        assert!(!Tier::S2.is_s0());
        assert!(!Tier::S3.is_s0());

        assert!(Tier::S3.is_s3());
        assert!(!Tier::S0.is_s3());
        assert!(!Tier::S1.is_s3());
        assert!(!Tier::S2.is_s3());
    }

    #[test]
    fn issue_status_json_names_are_stable() {
        let names = [
            (IssueStatus::PendingApproval, "PendingApproval"),
            (IssueStatus::Approved, "Approved"),
            (IssueStatus::Merged, "Merged"),
            (IssueStatus::PayoutRequested, "PayoutRequested"),
            (IssueStatus::PayoutPending, "PayoutPending"),
            (IssueStatus::PayoutProcessing, "PayoutProcessing"),
            (IssueStatus::PayoutFailed, "PayoutFailed"),
            (IssueStatus::Paid, "Paid"),
            (IssueStatus::Escalated, "Escalated"),
            (IssueStatus::Cancelled, "Cancelled"),
            (IssueStatus::Refunded, "Refunded"),
        ];
        for (value, name) in names {
            assert_eq!(
                serde_json::to_string(&value).unwrap(),
                format!("\"{name}\"")
            );
        }
    }

    #[test]
    fn issue_kind_json_names_are_stable() {
        assert_eq!(
            serde_json::to_string(&IssueKind::PublicIssue).unwrap(),
            "\"PublicIssue\""
        );
        assert_eq!(
            serde_json::to_string(&IssueKind::PrivateSecurity).unwrap(),
            "\"PrivateSecurity\""
        );
    }

    #[test]
    fn merge_source_json_names_are_stable() {
        assert_eq!(
            serde_json::to_string(&MergeSource::Oracle).unwrap(),
            "\"Oracle\""
        );
        assert_eq!(
            serde_json::to_string(&MergeSource::Manual).unwrap(),
            "\"Manual\""
        );
    }

    #[test]
    fn approval_source_json_names_are_stable() {
        assert_eq!(
            serde_json::to_string(&ApprovalSource::AutoS3).unwrap(),
            "\"AutoS3\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalSource::Maintainer).unwrap(),
            "\"Maintainer\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalSource::Council).unwrap(),
            "\"Council\""
        );
        assert_eq!(
            serde_json::to_string(&ApprovalSource::BootstrapCouncil).unwrap(),
            "\"BootstrapCouncil\""
        );
    }

    #[test]
    fn payout_status_json_names_are_stable() {
        assert_eq!(
            serde_json::to_string(&PayoutStatus::Processing).unwrap(),
            "\"Processing\""
        );
        assert_eq!(
            serde_json::to_string(&PayoutStatus::Paid).unwrap(),
            "\"Paid\""
        );
        assert_eq!(
            serde_json::to_string(&PayoutStatus::Failed).unwrap(),
            "\"Failed\""
        );
        assert_eq!(
            serde_json::to_string(&PayoutStatus::Refunded).unwrap(),
            "\"Refunded\""
        );
    }

    #[test]
    fn board_config_defaults_are_production_values() {
        let config = BoardConfig::default();
        assert_eq!(
            config.bootstrap_until_maintainers,
            DEFAULT_BOOTSTRAP_UNTIL_MAINTAINERS
        );
        assert_eq!(config.maintainer_challenge_secs, WEEK_SECS);
        assert_eq!(config.council_promotion_min_tenure_secs, WEEK_SECS);
        assert_eq!(config.council_promotion_delay_secs, WEEK_SECS);
        assert_eq!(
            config.council_promotion_min_approvals,
            DEFAULT_COUNCIL_PROMOTION_MIN_APPROVALS
        );
        assert_eq!(config.council_role_name, DEFAULT_COUNCIL_ROLE_NAME);
    }

    fn sample_issue(issue_number: Option<u64>, private_ref: Option<PrivateRef>) -> Issue {
        Issue {
            repo_id: 0,
            kind: if issue_number.is_some() {
                IssueKind::PublicIssue
            } else {
                IssueKind::PrivateSecurity
            },
            issue_number,
            private_ref,
            tier: Tier::S2,
            amount: U128(ONE_NEAR),
            status: IssueStatus::PendingApproval,
            creator: "alice.near".parse().unwrap(),
            claimants: Vec::new(),
            approvals: Vec::new(),
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

    #[test]
    fn issue_requires_exactly_one_identifier() {
        assert!(sample_issue(Some(7), None).has_exactly_one_identifier());
        assert!(sample_issue(None, Some("a".repeat(64))).has_exactly_one_identifier());
        assert!(!sample_issue(Some(7), Some("a".repeat(64))).has_exactly_one_identifier());
        assert!(!sample_issue(None, None).has_exactly_one_identifier());
    }

    #[test]
    fn undisclosed_issue_json_has_no_advisory_fields() {
        let json = serde_json::to_string(&sample_issue(None, Some("a".repeat(64)))).unwrap();
        assert!(json.contains("private_ref"));
        assert!(!json.contains("ghsa_id"));
        assert!(!json.contains("advisory_url"));
        assert!(!json.contains("researcher_github"));
    }
}
