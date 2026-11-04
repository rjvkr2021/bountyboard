use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near};
use serde::Serialize;

use crate::types::{IssueId, IssueStatus, RepoId, Tier};

pub const EVENT_STANDARD: &str = "bountyboard";
pub const EVENT_VERSION: &str = "1.0.0";

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoAdded {
    pub repo_id: RepoId,
    pub github_repo: String,
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
    maintainers: Vec<AccountId>,
    oracle: AccountId,
) {
    emit(
        "repo_added",
        &RepoAdded {
            repo_id,
            github_repo,
            maintainers,
            oracle,
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
        assert_eq!(value["data"]["maintainers"][0], accounts(1).to_string());
        assert_eq!(value["data"]["oracle"], accounts(2).to_string());
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
}
