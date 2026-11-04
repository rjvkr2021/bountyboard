use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, PanicOnDefault, near};

pub mod access;
pub mod errors;
pub mod state;
pub mod types;

use crate::state::StorageKey;
use crate::types::{
    BoardConfig, Candidate, CouncilRequest, DaoParams, Issue, IssueId, PayoutId, PayoutRecord,
    PrivateRef, Repo, RepoId, Reputation,
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::testing_env;

    fn context() {
        testing_env!(VMContextBuilder::new().build());
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
}
