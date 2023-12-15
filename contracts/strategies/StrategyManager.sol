pragma solidity ^0.8.2;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStrategyManager.sol";
import "./interfaces/IStrategy.sol";

contract StrategyManager is IStrategyManager, Ownable {
    mapping(uint256 => StrategyData) public strategies;
    uint256 public numStrategies = 2;

    constructor() Ownable() {}

    function getStrategy(
        uint256 _id
    ) external view override returns (StrategyData memory) {
        return strategies[_id];
    }

    function addStrategy(address _strategyContract) external onlyOwner {
        require(_strategyContract != address(0), "Strategy address invalid");
        uint256 strategyIndex = numStrategies++;
        strategies[strategyIndex] = StrategyData(
            IStrategy(_strategyContract),
            true
        );
        emit StrategyCreated(strategyIndex, _strategyContract);
    }

    function enableStrategy(uint _strategyIndex) external onlyOwner {
        require(_strategyIndex <= numStrategies, "Invalid strategy");
        strategies[_strategyIndex].enabled = true;
        emit StrategyEnabled(
            _strategyIndex,
            address(strategies[_strategyIndex].strategyContract)
        );
    }

    function disableStrategy(uint _strategyIndex) external onlyOwner {
        require(_strategyIndex <= numStrategies, "Invalid strategy");
        strategies[_strategyIndex].enabled = false;
        emit StrategyDisabled(
            _strategyIndex,
            address(strategies[_strategyIndex].strategyContract)
        );
    }
}
