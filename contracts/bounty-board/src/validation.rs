use crate::errors::ContractError;
use crate::types::{Repo, Tier};

pub fn validate_tier(tier: Tier) -> Result<(), ContractError> {
    if tier.is_s0() {
        Err(ContractError::S0NotEnabled)
    } else {
        Ok(())
    }
}

pub fn validate_amount(amount: u128) -> Result<(), ContractError> {
    if amount == 0 {
        Err(ContractError::InvalidAmount)
    } else {
        Ok(())
    }
}

pub fn assert_budget_available(repo: &Repo, amount: u128) -> Result<(), ContractError> {
    let committed = repo
        .committed
        .checked_add(amount)
        .ok_or(ContractError::BudgetExceeded)?;
    if committed > repo.budget {
        Err(ContractError::BudgetExceeded)
    } else {
        Ok(())
    }
}

pub fn assert_daily_cap(repo: &Repo, spent: u128, amount: u128) -> Result<(), ContractError> {
    let total = spent
        .checked_add(amount)
        .ok_or(ContractError::DailyCapExceeded)?;
    if total > repo.daily_cap {
        Err(ContractError::DailyCapExceeded)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MaintainerRecord;
    use near_sdk::test_utils::accounts;
    use std::collections::BTreeMap;

    fn repo(budget: u128, committed: u128, daily_cap: u128) -> Repo {
        let mut maintainers = BTreeMap::new();
        maintainers.insert(
            accounts(1),
            MaintainerRecord {
                since: 0,
                bounties_approved: 0,
                last_council_request_at: 0,
            },
        );
        Repo {
            github_repo: "owner/repo".to_string(),
            maintainers,
            oracle: accounts(2),
            budget,
            committed,
            daily_cap,
            paused: false,
            bootstrap_ended: false,
        }
    }

    #[test]
    fn tier_validation_rejects_s0() {
        assert_eq!(validate_tier(Tier::S0), Err(ContractError::S0NotEnabled));
        assert_eq!(validate_tier(Tier::S1), Ok(()));
        assert_eq!(validate_tier(Tier::S2), Ok(()));
        assert_eq!(validate_tier(Tier::S3), Ok(()));
    }

    #[test]
    fn amount_validation_rejects_zero() {
        assert_eq!(validate_amount(0), Err(ContractError::InvalidAmount));
        assert_eq!(validate_amount(1), Ok(()));
    }

    #[test]
    fn budget_validation_handles_boundaries_and_overflow() {
        let repo = repo(100, 40, 100);
        assert_eq!(assert_budget_available(&repo, 60), Ok(()));
        assert_eq!(
            assert_budget_available(&repo, 61),
            Err(ContractError::BudgetExceeded)
        );
        assert_eq!(
            assert_budget_available(&repo, u128::MAX),
            Err(ContractError::BudgetExceeded)
        );
    }

    #[test]
    fn daily_cap_validation_handles_boundaries_and_overflow() {
        let repo = repo(100, 0, 25);
        assert_eq!(assert_daily_cap(&repo, 20, 5), Ok(()));
        assert_eq!(
            assert_daily_cap(&repo, 20, 6),
            Err(ContractError::DailyCapExceeded)
        );
        assert_eq!(
            assert_daily_cap(&repo, u128::MAX, 1),
            Err(ContractError::DailyCapExceeded)
        );
    }
}
