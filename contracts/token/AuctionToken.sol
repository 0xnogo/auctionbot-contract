// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapV2Factory.sol";
import "../interfaces/IUniswapV2Router02Wrapper.sol";

contract AuctionToken is ERC20, Ownable {
    IUniswapV2Router02Wrapper public uniswapV2Router;
    address public immutable uniswapV2Pair;

    uint256 public revShareFee;
    uint256 public buybackFee;
    uint256 public lpFee;
    uint256 public teamFee;
    uint256 public totalFee;

    uint256 public ethDistributionThreshold = 1 ether;

    uint256 public constant BASE = 100;

    address public revShareWallet;
    address public teamWallet;

    // ========== EVENTS ==========

    event LiquidityAdded(uint256 tokens, uint256 eth);
    event Distribution(
        uint256 amountForLiquidity,
        uint256 amountForRevShare,
        uint256 amountForTeam,
        uint256 amountForBuyBack
    );
    event FeesUpdated(
        uint256 revShareFee,
        uint256 buybackFee,
        uint256 lpFee,
        uint256 teamFee,
        uint256 totalFee
    );

    // ========== ERRORS ==========

    error InvalidFee();
    error EthSendingFailed();

    // ========== CONSTRUCTOR ==========

    /**
     * @dev Sets up the AuctionToken contract with predefined fees and Uniswap router.
     * @param _revShareFee Initial revenue share fee.
     * @param _buybackFee Initial buyback fee.
     * @param _lpFee Initial liquidity provider fee.
     * @param _teamFee Initial team fee.
     * @param _revShareWallet Address of the revenue sharing wallet.
     * @param _teamWallet Address of the team wallet.
     * @param _uniswapV2Router Address of the UniswapV2Router.
     */
    constructor(
        uint256 _revShareFee,
        uint256 _buybackFee,
        uint256 _lpFee,
        uint256 _teamFee,
        address _revShareWallet,
        address _teamWallet,
        IUniswapV2Router02Wrapper _uniswapV2Router
    ) ERC20("Auction", "AUCTION") {
        uniswapV2Router = _uniswapV2Router;

        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());

        uint256 totalSupply = 1_000_000 * 1e18;

        revShareFee = _revShareFee;
        buybackFee = _buybackFee;
        lpFee = _lpFee;
        teamFee = _teamFee;
        totalFee = revShareFee + buybackFee + lpFee + teamFee;

        if (totalFee != BASE) {
            revert InvalidFee();
        }

        revShareWallet = _revShareWallet;

        teamWallet = _teamWallet;

        _mint(msg.sender, totalSupply);
    }

    // ========== PUBLIC FUNCTIONS ==========

    /**
     * @dev Public receive function to allow the contract to receive ETH.
     */
    receive() external payable {}

    // ========== ONLYOWNER (ADMIN) FUNCTIONS ==========

    /**
     * @notice Executes the distribution of contract's token balance for liquidity, revenue sharing, team, and buyback.
     * @dev This function should be called to trigger the distribution mechanism manually.
     *      It requires the caller to be the contract owner. It will call the internal function
     *      `_executeDistribution` with the contract's current token balance.
     */
    function executeDistribution() external onlyOwner {
        uint256 contractEthBalance = address(this).balance;

        _executeDistribution(contractEthBalance);
    }

    /**
     * @dev Sets a new revenue share wallet address
     * @param _newRevShareWallet The new wallet address for revenue sharing
     */
    function setRevShareWallet(address _newRevShareWallet) external onlyOwner {
        require(
            _newRevShareWallet != address(0),
            "New address is the zero address"
        );
        require(
            _newRevShareWallet != revShareWallet,
            "New address is the same as current address"
        );
        revShareWallet = _newRevShareWallet;
    }

    /**
     * @dev Sets a new team wallet address
     * @param _newTeamWallet The new wallet address for the team
     */
    function setTeamWallet(address _newTeamWallet) external onlyOwner {
        require(
            _newTeamWallet != address(0),
            "New address is the zero address"
        );
        require(
            _newTeamWallet != teamWallet,
            "New address is the same as current address"
        );
        teamWallet = _newTeamWallet;
    }

    /**
     * @dev Updates fee percentages and recalculates the total fee
     * @param _revShareFee The new revenue share fee percentage
     * @param _buybackFee The new buyback fee percentage
     * @param _lpFee The new liquidity provider fee percentage
     * @param _teamFee The new team fee percentage
     */
    function setFees(
        uint256 _revShareFee,
        uint256 _buybackFee,
        uint256 _lpFee,
        uint256 _teamFee
    ) external onlyOwner {
        // Include validation to ensure that fees are within reasonable bounds
        uint256 newTotalFee = _revShareFee + _buybackFee + _lpFee + _teamFee;
        require(newTotalFee <= BASE, "Total fee exceeds the limit");

        // Update individual fees
        revShareFee = _revShareFee;
        buybackFee = _buybackFee;
        lpFee = _lpFee;
        teamFee = _teamFee;

        // Update total fee
        totalFee = newTotalFee;

        // Emit an event to notify off-chain clients of the fee update
        emit FeesUpdated(revShareFee, buybackFee, lpFee, teamFee, totalFee);
    }

    /**
     * @dev Sets a new threshold for when ETH distribution should occur
     * @param _newThreshold The new threshold in wei
     */
    function setEthDistributionThreshold(
        uint256 _newThreshold
    ) external onlyOwner {
        require(_newThreshold > 0, "Threshold must be greater than 0");
        ethDistributionThreshold = _newThreshold;
    }

    /**
     * @dev Allows the owner to withdraw any ERC20 token sent to the contract.
     * @param _token Address of the token contract.
     * @param _to Address to send the tokens to.
     */
    function withdrawStuckToken(
        address _token,
        address _to
    ) external onlyOwner {
        require(_token != address(0), "_token address cannot be 0");
        uint256 _contractBalance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(_to, _contractBalance);
    }

    /**
     * @dev Allows the owner to withdraw ETH sent to the contract.
     * @param toAddr Address to send the ETH to.
     */
    function withdrawStuckEth(address toAddr) external onlyOwner {
        (bool success, ) = toAddr.call{value: address(this).balance}("");
        require(success);
    }

    // ========== OVERRIDES ==========

    /**
     * @dev Override function for ERC20 transfer to incorporate fee distribution.
     * @param from Address tokens are being transferred from.
     * @param to Address tokens are being transferred to.
     * @param amount Amount of tokens to transfer.
     */
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        if (amount == 0) {
            super._transfer(from, to, 0);
            return;
        }

        uint256 contractEthBalance = address(this).balance;

        if (
            contractEthBalance >= ethDistributionThreshold &&
            from != address(this) &&
            to != address(this) &&
            msg.sender != owner()
        ) {
            _executeDistribution(contractEthBalance);
        }

        super._transfer(from, to, amount);
    }

    // ========== PRIVATE FUNCTIONS ==========

    /**
     * @dev Executes distribution of ETH for liquidity, revenue share, team, and buyback.
     * @param contractEthBalance Amount of ETH to distribute.
     */
    function _executeDistribution(uint256 contractEthBalance) private {
        // Calculate amounts for each fee
        uint256 amountForLiquidity = (contractEthBalance * lpFee) / totalFee;
        uint256 amountForRevShare = (contractEthBalance * revShareFee) /
            totalFee;
        uint256 amountForTeam = (contractEthBalance * teamFee) / totalFee;
        uint256 amountForBuyBack = contractEthBalance -
            amountForLiquidity -
            amountForRevShare -
            amountForTeam;

        // Swap ETH for Auction for buyback and lp
        uint256 ethLiquidity = amountForLiquidity / 2;
        uint256 amountToSwap = amountForBuyBack + ethLiquidity;

        uint256 initialTokenBalance = balanceOf(address(this));
        _swapEthForTokens(amountToSwap);

        uint256 tokensBought = balanceOf(address(this)) - initialTokenBalance;
        uint256 tokensLiquidity = (tokensBought * ethLiquidity) / amountToSwap;

        if (tokensLiquidity > 0 && ethLiquidity > 0) {
            _addLiquidity(tokensLiquidity, ethLiquidity);
            emit LiquidityAdded(tokensLiquidity, ethLiquidity);
        }

        bool success;
        // send to team addy
        (success, ) = address(teamWallet).call{value: amountForTeam}("");

        if (!success) revert EthSendingFailed();

        // send to rev sharing addy
        (success, ) = address(revShareWallet).call{value: amountForRevShare}(
            ""
        );

        if (!success) revert EthSendingFailed();

        // emit event
        emit Distribution(
            amountForLiquidity,
            amountForRevShare,
            amountForTeam,
            amountForBuyBack
        );
    }

    function _addLiquidity(uint256 tokenAmount, uint256 ethAmount) private {
        // send tokens to the wrapper
        _transfer(address(this), address(uniswapV2Router), tokenAmount);
        // add the liquidity
        uniswapV2Router.addLiquidityETH{value: ethAmount}(
            address(this),
            tokenAmount,
            0, // slippage is unavoidable
            0, // slippage is unavoidable
            owner(),
            block.timestamp
        );
    }

    function _swapEthForTokens(uint256 ethAmount) private {
        // generate the uniswap pair path of token -> weth
        address[] memory path = new address[](2);
        path[0] = uniswapV2Router.WETH();
        path[1] = address(this);

        // make the swap
        uniswapV2Router.swapExactETHForTokens{value: ethAmount}(
            0, // accept any amount of Tokens
            path,
            address(this),
            block.timestamp
        );
    }
}
