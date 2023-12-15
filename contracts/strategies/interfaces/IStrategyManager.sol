pragma solidity ^0.8.2;

import "./IStrategy.sol";

struct StrategyData {
    IStrategy strategyContract;
    bool enabled;
}

interface IStrategyManager {
    event StrategyCreated(uint256 _index, address _strategy);
    event StrategyDisabled(uint256 _index, address _strategy);
    event StrategyEnabled(uint256 _index, address _strategy);

    function getStrategy(uint256 _id) external returns (StrategyData memory);
}
