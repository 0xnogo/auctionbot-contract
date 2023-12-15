pragma solidity ^0.8.2;

interface IStrategy {
    function execute(
        uint256 _amount,
        address _token,
        uint256 _auctionId,
        address _user
    ) external;

    function init(
        uint256 _auctionId,
        address _token,
        bytes32[] memory initParams
    ) external;
}
