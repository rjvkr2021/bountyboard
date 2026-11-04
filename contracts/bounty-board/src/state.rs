use near_sdk::{BorshStorageKey, near};

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Repos,
    Issues,
    IssueByNumber,
    PrivateRefs,
    Identities,
    AccountIdentities,
    Reputation,
    Payouts,
    Candidates,
    CouncilRequests,
    DailySpend,
}
