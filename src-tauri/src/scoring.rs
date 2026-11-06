//! Exact-integer rule calculations. Live settlement and lucky draws are separate integrations.
use std::cmp::Ordering;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy)]
pub enum ScoreRule {
    Damage,
    Tail,
    Lucky { digit: u8 },
}

/// Larger digit wins, comparing from the lowest place to the highest.
/// Missing higher places are zero. Never reverse the integer (which could overflow).
fn compare_places(mut left: u64, mut right: u64) -> Ordering {
    while left != 0 || right != 0 {
        let order = (right % 10).cmp(&(left % 10));
        if order != Ordering::Equal {
            return order;
        }
        left /= 10;
        right /= 10;
    }
    Ordering::Equal
}

impl ScoreRule {
    #[allow(dead_code)]
    pub fn validate(self) -> Result<Self, &'static str> {
        if matches!(self, Self::Lucky { digit: 10.., .. }) {
            return Err("Lucky digit must be between 0 and 9");
        }
        Ok(self)
    }

    /// Ascending comparator output puts the better result first.
    /// Equal results remain equal; player identity/order never silently breaks a tie.
    #[allow(dead_code)]
    pub fn compare(self, left: u64, right: u64) -> Result<Ordering, &'static str> {
        self.validate()?;
        Ok(match self {
            Self::Damage => right.cmp(&left),
            Self::Tail => compare_places(left, right),
            Self::Lucky { digit } => {
                let left_tail = left % 10;
                let right_tail = right % 10;
                let distance = left_tail
                    .abs_diff(u64::from(digit))
                    .cmp(&right_tail.abs_diff(u64::from(digit)));
                distance.then_with(|| compare_places(left, right))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(rule: ScoreRule, mut damage: Vec<u64>) -> Vec<u64> {
        damage.sort_by(|left, right| rule.compare(*left, *right).unwrap());
        damage
    }

    #[test]
    fn damage_uses_exact_full_integer_including_large_values() {
        assert_eq!(
            sorted(ScoreRule::Damage, vec![12348, 12349, u64::MAX, 0]),
            vec![u64::MAX, 12349, 12348, 0]
        );
    }

    #[test]
    fn tail_compares_ones_then_tens_then_hundreds_not_total_damage() {
        assert_eq!(
            sorted(
                ScoreRule::Tail,
                vec![99990, 12349, 10019, 10029, 10929, 10009]
            ),
            vec![12349, 10929, 10029, 10019, 10009, 99990]
        );
        assert_eq!(ScoreRule::Tail.compare(9, 109).unwrap(), Ordering::Greater);
    }

    #[test]
    fn lucky_uses_absolute_distance_without_wrapping() {
        let rule = ScoreRule::Lucky { digit: 7 };
        assert_eq!(sorted(rule, vec![1, 4, 8, 6, 7]), vec![7, 8, 6, 4, 1]);
        let rule = ScoreRule::Lucky { digit: 0 };
        assert_eq!(sorted(rule, vec![9, 1, 0]), vec![0, 1, 9]);
    }

    #[test]
    fn lucky_breaks_equal_distances_by_tail_then_higher_places() {
        let rule = ScoreRule::Lucky { digit: 7 };
        assert_eq!(rule.compare(196, 128).unwrap(), Ordering::Greater);
        assert_eq!(rule.compare(196, 296).unwrap(), Ordering::Greater);
        assert_eq!(rule.compare(1096, 1296).unwrap(), Ordering::Greater);
    }

    #[test]
    fn invalid_digits_fail_and_completely_equal_values_remain_tied() {
        assert!(ScoreRule::Lucky { digit: 10 }.compare(1, 2).is_err());
        for rule in [
            ScoreRule::Damage,
            ScoreRule::Tail,
            ScoreRule::Lucky { digit: 7 },
        ] {
            assert_eq!(rule.compare(u64::MAX, u64::MAX).unwrap(), Ordering::Equal);
        }
    }
}
