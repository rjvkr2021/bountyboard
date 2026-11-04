use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::{AccountId, ext_contract, near};

pub const GAS_FOR_ADD_PROPOSAL: u64 = 30_000_000_000_000;
pub const GAS_FOR_ACT_PROPOSAL: u64 = 30_000_000_000_000;
pub const GAS_FOR_GET_POLICY: u64 = 10_000_000_000_000;
pub const GAS_FOR_GET_PROPOSAL: u64 = 10_000_000_000_000;
pub const GAS_FOR_GET_BOUNTY: u64 = 10_000_000_000_000;

#[ext_contract(ext_dao)]
pub trait Dao {
    fn add_proposal(&mut self, proposal: ProposalInput) -> u64;
    fn act_proposal(&mut self, id: u64, action: Action, memo: Option<String>);
    fn get_policy(&self) -> Policy;
    fn get_proposal(&self, id: u64) -> ProposalOutput;
    fn get_available_amount(&self) -> U128;
    fn get_bounty(&self, bounty_id: u64) -> BountyOutput;
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProposalInput {
    pub description: String,
    pub kind: ProposalKind,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProposalKind {
    FunctionCall {
        receiver_id: AccountId,
        actions: Vec<ActionCall>,
    },
    AddBounty {
        bounty: Bounty,
    },
    BountyDone {
        bounty_id: u64,
        receiver_id: AccountId,
    },
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bounty {
    pub description: String,
    pub token: String,
    pub amount: U128,
    pub times: u32,
    pub max_deadline: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BountyOutput {
    pub id: u64,
    #[serde(flatten)]
    pub bounty: Bounty,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ActionCall {
    pub method_name: String,
    pub args: Base64VecU8,
    pub deposit: U128,
    pub gas: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    VoteApprove,
    VoteReject,
    VoteRemove,
    Finalize,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalStatus {
    InProgress,
    Approved,
    Rejected,
    Removed,
    Expired,
    Moved,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    pub roles: Vec<RolePermission>,
    pub default_vote_policy: VotePolicy,
    pub proposal_bond: U128,
    pub proposal_period: U64,
    pub bounty_bond: U128,
    pub bounty_forgiveness_period: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct VotePolicy {
    pub weight_kind: WeightKind,
    pub quorum: U128,
    pub threshold: WeightOrRatio,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub enum WeightKind {
    TokenWeight,
    RoleWeight,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum WeightOrRatio {
    Weight(U128),
    Ratio(u64, u64),
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct RolePermission {
    pub name: String,
    pub kind: RoleKind,
    pub permissions: Vec<String>,
    pub vote_policy: std::collections::BTreeMap<String, VotePolicy>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub enum RoleKind {
    Everyone,
    Member(u128),
    Group(std::collections::BTreeSet<AccountId>),
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Proposal {
    pub status: ProposalStatus,
    pub kind: ProposalKind,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ProposalOutput {
    pub id: u64,
    #[serde(flatten)]
    pub proposal: Proposal,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::{json, to_value};

    #[test]
    fn add_proposal_payload_matches_sputnik_json() {
        let input = ProposalInput {
            description: "BountyBoard payout issue 7".to_string(),
            kind: ProposalKind::FunctionCall {
                receiver_id: "bountyboard.bounty-dao.bountyboard.testnet"
                    .parse()
                    .unwrap(),
                actions: vec![ActionCall {
                    method_name: "payout_near".to_string(),
                    args: Base64VecU8(br#"{"issue_id":7}"#.to_vec()),
                    deposit: U128(2_000_000_000_000_000_000_000_000),
                    gas: U64(GAS_FOR_ACT_PROPOSAL),
                }],
            },
        };

        assert_eq!(
            to_value(input).unwrap(),
            json!({
                "description": "BountyBoard payout issue 7",
                "kind": {
                    "FunctionCall": {
                        "receiver_id": "bountyboard.bounty-dao.bountyboard.testnet",
                        "actions": [{
                            "method_name": "payout_near",
                            "args": "eyJpc3N1ZV9pZCI6N30=",
                            "deposit": "2000000000000000000000000",
                            "gas": "30000000000000"
                        }]
                    }
                }
            })
        );
    }

    #[test]
    fn add_bounty_payload_matches_sputnik_json() {
        let input = ProposalInput {
            description: "BountyBoard bounty issue 7".to_string(),
            kind: ProposalKind::AddBounty {
                bounty: Bounty {
                    description: "bountyboard:7:42".to_string(),
                    token: String::new(),
                    amount: U128(2_000_000_000_000_000_000_000_000),
                    times: 1,
                    max_deadline: U64(30 * 24 * 60 * 60 * 1_000_000_000),
                },
            },
        };

        assert_eq!(
            to_value(input).unwrap(),
            json!({
                "description": "BountyBoard bounty issue 7",
                "kind": {
                    "AddBounty": {
                        "bounty": {
                            "description": "bountyboard:7:42",
                            "token": "",
                            "amount": "2000000000000000000000000",
                            "times": 1,
                            "max_deadline": "2592000000000000"
                        }
                    }
                }
            })
        );
    }

    #[test]
    fn bounty_done_proposal_parses_sputnik_json() {
        let value = json!({
            "id": 9,
            "proposer": "founder.bountyboard.testnet",
            "description": "Bounty done",
            "kind": {
                "BountyDone": {
                    "bounty_id": 4,
                    "receiver_id": "contributor.testnet"
                }
            },
            "status": "InProgress"
        });

        let output: ProposalOutput = near_sdk::serde_json::from_value(value).unwrap();
        assert_eq!(output.id, 9);
        assert_eq!(
            output.proposal.kind,
            ProposalKind::BountyDone {
                bounty_id: 4,
                receiver_id: "contributor.testnet".parse().unwrap()
            }
        );
    }

    #[test]
    fn bounty_output_parses_flattened_sputnik_json() {
        let value = json!({
            "id": 4,
            "description": "bountyboard:7:42",
            "token": "",
            "amount": "2000000000000000000000000",
            "times": 1,
            "max_deadline": "2592000000000000"
        });

        let output: BountyOutput = near_sdk::serde_json::from_value(value).unwrap();
        assert_eq!(output.id, 4);
        assert_eq!(output.bounty.description, "bountyboard:7:42");
        assert_eq!(output.bounty.token, "");
        assert_eq!(output.bounty.max_deadline, U64(2_592_000_000_000_000));
    }

    #[test]
    fn policy_parses_sputnik_json_with_string_amounts() {
        let value = json!({
            "roles": [],
            "default_vote_policy": {
                "weight_kind": "RoleWeight",
                "quorum": "0",
                "threshold": [1, 2]
            },
            "proposal_bond": "1000000000000000000000000",
            "proposal_period": "604800000000000",
            "bounty_bond": "2000000000000000000000000",
            "bounty_forgiveness_period": "86400000000000"
        });
        let policy: Policy = near_sdk::serde_json::from_value(value).unwrap();
        assert_eq!(
            policy.proposal_bond,
            U128(1_000_000_000_000_000_000_000_000)
        );
        assert_eq!(policy.proposal_period, U64(604_800_000_000_000));
        assert_eq!(policy.bounty_bond, U128(2_000_000_000_000_000_000_000_000));
        assert_eq!(policy.bounty_forgiveness_period, U64(86_400_000_000_000));
    }

    #[test]
    fn proposal_output_parses_flattened_sputnik_json() {
        let value = json!({
            "id": 4,
            "proposer": "founder.bountyboard.testnet",
            "description": "BountyBoard payout issue 7",
            "kind": {
                "FunctionCall": {
                    "receiver_id": "bountyboard.bounty-dao.bountyboard.testnet",
                    "actions": []
                }
            },
            "status": "Approved",
            "vote_counts": {},
            "votes": {},
            "submission_time": "1700000000000000000"
        });
        let output: ProposalOutput = near_sdk::serde_json::from_value(value).unwrap();
        assert_eq!(output.id, 4);
        assert_eq!(output.proposal.status, ProposalStatus::Approved);
    }
}
