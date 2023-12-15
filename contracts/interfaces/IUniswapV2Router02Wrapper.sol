// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IUniswapV2Router02.sol";

interface IUniswapV2Router02Wrapper {
    function uniswapV2Router() external view returns (IUniswapV2Router02);

    function factory() external view returns (address);

    function WETH() external view returns (address);

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint256 deadline
    ) external payable;

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}
