use near_sdk::{AccountId, env};

use crate::BountyBoard;
use crate::errors::ContractError;
use crate::types::{Issue, IssueKind, IssueStatus, Repo};

pub fn assert_dao(contract: &BountyBoard) -> Result<(), ContractError> {
    if env::predecessor_account_id() == contract.dao {
        Ok(())
    } else {
        Err(ContractError::NotDao)
    }
}

pub fn assert_oracle(repo: &Repo) -> Result<(), ContractError> {
    if env::predecessor_account_id() == repo.oracle {
        Ok(())
    } else {
        Err(ContractError::NotOracle)
    }
}

pub fn assert_maintainer(repo: &Repo, account: &AccountId) -> Result<(), ContractError> {
    if repo.maintainers.contains_key(account) {
        Ok(())
    } else {
        Err(ContractError::NotMaintainer)
    }
}

pub fn assert_council(repo: &Repo, account: &AccountId) -> Result<(), ContractError> {
    if repo
        .maintainers
        .get(account)
        .is_some_and(|record| record.council_derived)
    {
        Ok(())
    } else {
        Err(ContractError::NotCouncil)
    }
}

pub fn assert_repo_open(repo: &Repo) -> Result<(), ContractError> {
    if repo.paused {
        Err(ContractError::RepoPaused)
    } else {
        Ok(())
    }
}

pub fn assert_not_paid(issue: &Issue) -> Result<(), ContractError> {
    if issue.status == IssueStatus::Paid {
        Err(ContractError::InvalidState)
    } else {
        Ok(())
    }
}

pub fn assert_public_issue(issue: &Issue) -> Result<(), ContractError> {
    if issue.kind == IssueKind::PublicIssue {
        Ok(())
    } else {
        Err(ContractError::WrongIssueKind)
    }
}

pub fn assert_private_issue(issue: &Issue) -> Result<(), ContractError> {
    if issue.kind == IssueKind::PrivateSecurity {
        Ok(())
    } else {
        Err(ContractError::WrongIssueKind)
    }
}

pub fn assert_disclosed(issue: &Issue) -> Result<(), ContractError> {
    if issue.security.is_some() {
        Ok(())
    } else {
        Err(ContractError::SecurityNotDisclosed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Approval, BoardConfig, MaintainerRecord, Repo, SecurityDisclosure, Tier};
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;
    use std::collections::BTreeMap;

    fn set_predecessor(account: AccountId) {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(account);
        testing_env!(builder.build());
    }

    fn sample_repo(oracle: AccountId, maintainer: AccountId) -> Repo {
        let mut maintainers = BTreeMap::new();
        maintainers.insert(maintainer, MaintainerRecord::new(0));
        Repo {
            github_repo: "owner/repo".to_string(),
            github_repo_id: 0,
            verification_source: "legacy".to_string(),
            created_at: 0,
            maintainers,
            oracle,
            budget: U128(0),
            committed: U128(0),
            daily_cap: U128(0),
            paused: false,
            bootstrap_ended: false,
        }
    }

    fn sample_issue(kind: IssueKind, status: IssueStatus) -> Issue {
        Issue {
            repo_id: 0,
            kind,
            issue_number: if kind == IssueKind::PublicIssue {
                Some(1)
            } else {
                None
            },
            private_ref: if kind == IssueKind::PrivateSecurity {
                Some("a".repeat(64))
            } else {
                None
            },
            tier: Tier::S1,
            amount: U128(1),
            status,
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

    #[test]
    fn dao_access() {
        testing_env!(VMContextBuilder::new().build());
        let contract = BountyBoard::new(accounts(0), Some(BoardConfig::default()));

        set_predecessor(accounts(0));
        assert_eq!(assert_dao(&contract), Ok(()));

        set_predecessor(accounts(1));
        assert_eq!(assert_dao(&contract), Err(ContractError::NotDao));
    }

    #[test]
    fn oracle_access() {
        let repo = sample_repo(accounts(2), accounts(1));

        set_predecessor(accounts(2));
        assert_eq!(assert_oracle(&repo), Ok(()));

        set_predecessor(accounts(3));
        assert_eq!(assert_oracle(&repo), Err(ContractError::NotOracle));
    }

    #[test]
    fn maintainer_access() {
        let repo = sample_repo(accounts(2), accounts(1));

        assert_eq!(assert_maintainer(&repo, &accounts(1)), Ok(()));
        assert_eq!(
            assert_maintainer(&repo, &accounts(2)),
            Err(ContractError::NotMaintainer)
        );
    }

    #[test]
    fn council_access() {
        let mut repo = sample_repo(accounts(2), accounts(1));
        assert_eq!(
            assert_council(&repo, &accounts(1)),
            Err(ContractError::NotCouncil)
        );
        if let Some(record) = repo.maintainers.get_mut(&accounts(1)) {
            record.council_derived = true;
        }
        assert_eq!(assert_council(&repo, &accounts(1)), Ok(()));
    }

    #[test]
    fn repo_open_check() {
        let mut repo = sample_repo(accounts(2), accounts(1));
        assert_eq!(assert_repo_open(&repo), Ok(()));

        repo.paused = true;
        assert_eq!(assert_repo_open(&repo), Err(ContractError::RepoPaused));
    }

    #[test]
    fn not_paid_check() {
        let issue = sample_issue(IssueKind::PublicIssue, IssueStatus::PendingApproval);
        assert_eq!(assert_not_paid(&issue), Ok(()));

        let paid = sample_issue(IssueKind::PublicIssue, IssueStatus::Paid);
        assert_eq!(assert_not_paid(&paid), Err(ContractError::InvalidState));
    }

    #[test]
    fn issue_kind_checks() {
        let public = sample_issue(IssueKind::PublicIssue, IssueStatus::Approved);
        let private = sample_issue(IssueKind::PrivateSecurity, IssueStatus::Approved);

        assert_eq!(assert_public_issue(&public), Ok(()));
        assert_eq!(
            assert_public_issue(&private),
            Err(ContractError::WrongIssueKind)
        );
        assert_eq!(assert_private_issue(&private), Ok(()));
        assert_eq!(
            assert_private_issue(&public),
            Err(ContractError::WrongIssueKind)
        );
    }

    #[test]
    fn disclosure_check() {
        let mut issue = sample_issue(IssueKind::PrivateSecurity, IssueStatus::Merged);
        assert_eq!(
            assert_disclosed(&issue),
            Err(ContractError::SecurityNotDisclosed)
        );

        issue.security = Some(SecurityDisclosure {
            ghsa_id: "GHSA-xxxx-yyyy-zzzz".to_string(),
            advisory_url: "https://github.com/owner/repo/security/advisories/GHSA-xxxx".to_string(),
            researcher_github: "researcher".to_string(),
            disclosed_at: 1,
        });
        assert_eq!(assert_disclosed(&issue), Ok(()));
    }
}
