use near_sdk::{AccountId, PanicOnDefault, near};

pub mod types;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BountyBoard {
    dao: AccountId,
}

#[near]
impl BountyBoard {
    #[init]
    pub fn new(dao: AccountId) -> Self {
        Self { dao }
    }

    pub fn get_dao(&self) -> AccountId {
        self.dao.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::accounts;

    #[test]
    fn new_stores_dao() {
        let dao = accounts(1);
        let contract = BountyBoard::new(dao.clone());
        assert_eq!(contract.get_dao(), dao);
    }
}
