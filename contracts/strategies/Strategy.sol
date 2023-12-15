pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";

abstract contract Strategy is AccessControl {
    event StrategyCreated(uint256 _auctionId, address _token);
    event StrategyExecuted(
        uint256 _amount,
        address _token,
        uint256 _auctionId,
        address _user
    );

    bytes32 internal constant AUCTION_CONTROLLER_ROLE =
        keccak256("AUCTION_CONTROLLER_ROLE");

    constructor(address _auction) AccessControl() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AUCTION_CONTROLLER_ROLE, _auction);
    }

    function execute(
        uint256 _amount,
        address _token,
        uint256 _auctionId,
        address _user
    ) external virtual;

    function init(
        uint256 _auctionId,
        address _token,
        bytes32[] memory initParams
    ) external virtual;
}
