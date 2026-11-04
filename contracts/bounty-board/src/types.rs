use near_sdk::near;

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const S3_AUTO_APPROVE_MAX_YOCTO: u128 = 25 * ONE_NEAR;

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
}
