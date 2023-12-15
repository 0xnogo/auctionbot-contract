// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TokenVesting
/// @dev This contract allows vesting of an ERC20 token with multiple beneficiary.
/// Each beneficiary can have a different vesting schedule.
/// This implementation uses timestamps, not block numbers.
/// Based on openzeppelin's {VestingWallet}
contract TokenVesting is AccessControl {
    using SafeERC20 for IERC20;

    event NewBeneficiary(
        address indexed beneficiary,
        uint256 totalAllocation,
        uint256 startTimestamp,
        uint256 cliffDuration,
        uint256 duration,
        bytes32 vestingKey
    );
    event Released(address indexed beneficiary, uint256 amount);
    event Revoked(address indexed revokee, uint256 amount);

    struct VestingSchedule {
        uint256 totalAllocation;
        uint256 start;
        uint256 released;
        address beneficiary;
    }

    uint256 cliffDuration;
    uint256 duration;

    IERC20 public token;
    mapping(bytes32 => VestingSchedule) public vestingSchedules;
    mapping(address => uint256) public holderVestingCount;

    constructor(
        address _token,
        uint256 _cliffDuration,
        uint256 _vestingDuration
    ) {
        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
        cliffDuration = _cliffDuration;
        duration = _vestingDuration;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function computeVestingScheduleIdForAddressAndIndex(
        address holder,
        uint256 index
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(holder, index));
    }

    function vestTokens(
        address beneficiary,
        uint256 totalAllocation,
        uint256 start
    ) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 vestingKey = computeVestingScheduleIdForAddressAndIndex(
            beneficiary,
            holderVestingCount[beneficiary]++
        );
        require(beneficiary != address(0), "Invalid beneficiary");
        require(
            vestingSchedules[vestingKey].totalAllocation == 0,
            "Beneficiary already exists"
        );
        require(totalAllocation > 0, "Invalid allocation");
        require(start > block.timestamp, "Invalid start");
        require(duration > 0, "Invalid duration");
        require(duration > cliffDuration, "Invalid cliff");

        vestingSchedules[vestingKey] = VestingSchedule({
            totalAllocation: totalAllocation,
            start: start,
            released: 0,
            beneficiary: beneficiary
        });

        emit NewBeneficiary(
            beneficiary,
            totalAllocation,
            start,
            cliffDuration,
            duration,
            vestingKey
        );
    }

    /// @notice Releases tokens that have already vested
    /// @dev Emits a {Released} event
    function releaseAll(address _account) public {
        for (uint index = 0; index < holderVestingCount[_account]; index++) {
            bytes32 _key = computeVestingScheduleIdForAddressAndIndex(
                _account,
                index
            );
            release(_key);
        }
    }

    /// @notice Releases tokens that have already vested
    /// @dev Emits a {Released} event
    function release(bytes32 _key) public virtual {
        uint256 releasable = releasableAmount(_key);
        require(releasable > 0, "No releasable tokens");

        VestingSchedule storage vestingSchedule = vestingSchedules[_key];

        vestingSchedule.released += releasable;
        token.safeTransfer(vestingSchedule.beneficiary, releasable);

        emit Released(msg.sender, releasable);
    }

    function lockedAmount(bytes32 _key) external view returns (uint256) {
        return vestingSchedules[_key].totalAllocation - vestedAmount(_key);
    }

    function releasableAmount(
        bytes32 _key
    ) public view virtual returns (uint256) {
        return vestedAmount(_key) - vestingSchedules[_key].released;
    }

    function vestedAmount(bytes32 _key) public view virtual returns (uint256) {
        return _vestingSchedule(vestingSchedules[_key], block.timestamp);
    }

    /// @dev Implementation of the vesting formula. This returns the amout vested, as a function of time, for
    /// an asset given its total historical allocation.
    /// @param schedule The vesting schedule to use in the calculation
    /// @param timestamp The timestamp to use in the calculation
    function _vestingSchedule(
        VestingSchedule memory schedule,
        uint256 timestamp
    ) internal view virtual returns (uint256) {
        if (duration == 0 || timestamp < schedule.start + cliffDuration) {
            return 0;
        } else if (timestamp > schedule.start + duration) {
            return schedule.totalAllocation;
        } else {
            return
                (schedule.totalAllocation * (timestamp - schedule.start)) /
                duration;
        }
    }
}
