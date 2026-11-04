use near_sdk::{FunctionError, near};

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq, FunctionError)]
pub enum ContractError {
    NotDao,
    NotOracle,
    NotMaintainer,
    RepoNotFound,
    IssueNotFound,
    PayoutNotFound,
    NotFound,
    InvalidState,
    EmptyMaintainers,
    DuplicateRepo,
    DuplicateIssueNumber,
    InvalidPrivateRef,
    DuplicatePrivateRef,
    ClaimantLimitReached,
    WrongIssueKind,
    WrongTier,
    BountyDescriptionMismatch,
    BountyAmountMismatch,
    BountyTokenMismatch,
    PrivateSecurityNoClaims,
    SecurityNotDisclosed,
    SecurityAlreadyDisclosed,
    BudgetExceeded,
    DailyCapExceeded,
    BudgetBelowCommitted,
    RepoPaused,
    Conflict,
    InsufficientApprovals,
    DaoCallFailed,
    OracleCallFailed,
    IdentityNotLinked,
    IdentityAlreadyLinked,
    CandidateNotFound,
    CandidateVetoed,
    ChallengeActive,
    AlreadyMaintainer,
    LastMaintainer,
    InsufficientTenure,
    CouncilRequestNotFound,
    CouncilRequestActive,
    CouncilCooldown,
    S0NotEnabled,
    InvalidAmount,
    InsufficientBond,
    StorageError,
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            ContractError::NotDao => "caller is not the DAO account",
            ContractError::NotOracle => "caller is not the repository oracle",
            ContractError::NotMaintainer => "caller is not a maintainer",
            ContractError::RepoNotFound => "repository not found",
            ContractError::IssueNotFound => "issue not found",
            ContractError::PayoutNotFound => "payout not found",
            ContractError::NotFound => "not found",
            ContractError::InvalidState => "invalid state for this operation",
            ContractError::EmptyMaintainers => "maintainer list cannot be empty",
            ContractError::DuplicateRepo => "repository already exists",
            ContractError::DuplicateIssueNumber => "issue number already has a bounty",
            ContractError::InvalidPrivateRef => {
                "private reference must be 64 lowercase hex characters"
            }
            ContractError::DuplicatePrivateRef => "private reference already registered",
            ContractError::ClaimantLimitReached => "claimant list is full",
            ContractError::WrongIssueKind => "wrong issue kind for this operation",
            ContractError::WrongTier => "wrong bounty tier for this operation",
            ContractError::BountyDescriptionMismatch => {
                "native bounty description does not match the issue"
            }
            ContractError::BountyAmountMismatch => "native bounty amount does not match the issue",
            ContractError::BountyTokenMismatch => "native bounty must pay in NEAR",
            ContractError::PrivateSecurityNoClaims => {
                "private security bounties do not accept public claims"
            }
            ContractError::SecurityNotDisclosed => "security bounty is not disclosed",
            ContractError::SecurityAlreadyDisclosed => "security bounty is already disclosed",
            ContractError::BudgetExceeded => "bounty amount exceeds the repository budget",
            ContractError::DailyCapExceeded => "daily spending cap exceeded",
            ContractError::BudgetBelowCommitted => "budget cannot be below the committed amount",
            ContractError::RepoPaused => "repository is paused",
            ContractError::Conflict => "caller is conflicted on this issue",
            ContractError::InsufficientApprovals => "insufficient unconflicted approvals",
            ContractError::DaoCallFailed => "DAO call failed",
            ContractError::OracleCallFailed => "oracle call failed",
            ContractError::IdentityNotLinked => "GitHub identity is not linked to a NEAR account",
            ContractError::IdentityAlreadyLinked => "GitHub identity is already linked",
            ContractError::CandidateNotFound => "promotion candidate not found",
            ContractError::CandidateVetoed => "promotion candidate was vetoed",
            ContractError::ChallengeActive => "candidate challenge window is still active",
            ContractError::AlreadyMaintainer => "account is already a maintainer",
            ContractError::LastMaintainer => "cannot remove the last maintainer",
            ContractError::InsufficientTenure => {
                "maintainer tenure is below the council promotion minimum"
            }
            ContractError::CouncilRequestNotFound => "no active council promotion request",
            ContractError::CouncilRequestActive => "a council promotion request is already active",
            ContractError::CouncilCooldown => "council promotion retry cooldown is active",
            ContractError::S0NotEnabled => "S0 bounties are not enabled yet",
            ContractError::InvalidAmount => "invalid bounty amount",
            ContractError::InsufficientBond => {
                "attached deposit does not cover the DAO proposal bond"
            }
            ContractError::StorageError => "storage error",
        };
        write!(f, "{message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_names_are_stable() {
        assert_eq!(
            serde_json::to_string(&ContractError::NotDao).unwrap(),
            "\"NotDao\""
        );
        assert_eq!(
            serde_json::to_string(&ContractError::SecurityNotDisclosed).unwrap(),
            "\"SecurityNotDisclosed\""
        );
        assert_eq!(
            serde_json::to_string(&ContractError::PrivateSecurityNoClaims).unwrap(),
            "\"PrivateSecurityNoClaims\""
        );
    }

    #[test]
    fn private_security_errors_are_redacted() {
        let errors = [
            ContractError::InvalidPrivateRef,
            ContractError::DuplicatePrivateRef,
            ContractError::PrivateSecurityNoClaims,
            ContractError::SecurityNotDisclosed,
            ContractError::SecurityAlreadyDisclosed,
            ContractError::WrongIssueKind,
        ];
        for error in errors {
            let message = error.to_string().to_lowercase();
            assert!(!message.contains("ghsa"));
            assert!(!message.contains("https://"));
            assert!(!message.contains("advisory_url"));
            assert!(!message.contains("researcher_github"));
        }
    }
}
