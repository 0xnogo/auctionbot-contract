// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.2;

interface ITokenVesting {
    function initialize(
        address _token,
        uint256 _cliffDuration,
        uint256 _vestingDuration
    ) external;

    function vestTokens(
        address beneficiary,
        uint256 totalAllocation,
        uint256 start
    ) external;
}
