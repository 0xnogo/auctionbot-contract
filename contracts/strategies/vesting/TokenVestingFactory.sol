// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.2;

import "../Strategy.sol";
import "./TokenVesting.sol";
import "./interfaces/ITokenVesting.sol";

struct StrategyParams {
    uint256 maxCliffDuration;
    uint256 maxVestDuration;
    uint256 minCliffDuration;
    uint256 minVestDuration;
}

contract TokenVestingFactory is Strategy {
    bytes32 internal constant OWNER = keccak256("OWNER");

    error InvalidParams();
    error InvalidVestingStrategy();

    StrategyParams public strategyParams;

    constructor(
        address _auction,
        StrategyParams memory _params
    ) Strategy(_auction) {
        if (
            _params.minVestDuration == 0 ||
            (_params.minCliffDuration > _params.maxCliffDuration) ||
            (_params.minVestDuration > _params.minVestDuration)
        ) revert InvalidParams();

        strategyParams = _params;

        _grantRole(OWNER, msg.sender);
    }

    //auction id-> vesting contract address
    mapping(uint => address) vestingStrategy;

    function updateStrategyParams(
        StrategyParams memory _params
    ) external onlyRole(OWNER) {
        if (
            _params.minVestDuration == 0 ||
            (_params.minCliffDuration > _params.maxCliffDuration) ||
            (_params.minVestDuration > _params.minVestDuration)
        ) revert InvalidParams();
        strategyParams = _params;
    }

    function init(
        uint256 _auctionId,
        address _token,
        bytes32[] memory initParams
    ) external override onlyRole(AUCTION_CONTROLLER_ROLE) {
        require(
            vestingStrategy[_auctionId] == address(0),
            "Strategy already created"
        );
        uint256 cliffDuration = uint256(initParams[0]);
        uint256 vestingDuration = uint256(initParams[1]);
        if (
            vestingDuration < strategyParams.minVestDuration ||
            vestingDuration > strategyParams.maxVestDuration ||
            cliffDuration < strategyParams.minCliffDuration ||
            cliffDuration > strategyParams.maxCliffDuration
        ) revert InvalidVestingStrategy();
        TokenVesting vesting = new TokenVesting(
            _token,
            cliffDuration,
            vestingDuration
        );
        vestingStrategy[_auctionId] = address(vesting);
        emit StrategyCreated(_auctionId, _token);
    }

    function execute(
        uint256 _amount,
        address _token,
        uint256 _auctionId,
        address _user
    ) external override onlyRole(AUCTION_CONTROLLER_ROLE) {
        IERC20(_token).transfer(vestingStrategy[_auctionId], _amount);
        ITokenVesting(vestingStrategy[_auctionId]).vestTokens(
            _user,
            _amount,
            block.timestamp
        );

        emit StrategyExecuted(_amount, _token, _auctionId, _user);
    }
}
