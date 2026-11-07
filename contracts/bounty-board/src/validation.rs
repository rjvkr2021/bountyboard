use crate::errors::ContractError;
use crate::types::Repo;

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
        .0
        .checked_add(amount)
        .ok_or(ContractError::BudgetExceeded)?;
    if committed > repo.budget.0 {
        Err(ContractError::BudgetExceeded)
    } else {
        Ok(())
    }
}

pub fn assert_daily_cap(repo: &Repo, spent: u128, amount: u128) -> Result<(), ContractError> {
    let total = spent
        .checked_add(amount)
        .ok_or(ContractError::DailyCapExceeded)?;
    if total > repo.daily_cap.0 {
        Err(ContractError::DailyCapExceeded)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::MaintainerRecord;
    use near_sdk::json_types::U128;
    use near_sdk::test_utils::accounts;
    use std::collections::BTreeMap;

    fn repo(budget: u128, committed: u128, daily_cap: u128) -> Repo {
        let mut maintainers = BTreeMap::new();
        maintainers.insert(accounts(1), MaintainerRecord::new(0));
        Repo {
            github_repo: "owner/repo".to_string(),
            github_repo_id: 0,
            verification_source: "legacy".to_string(),
            created_at: 0,
            maintainers,
            oracle: accounts(2),
            budget: U128(budget),
            committed: U128(committed),
            daily_cap: U128(daily_cap),
            paused: false,
            bootstrap_ended: false,
        }
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
