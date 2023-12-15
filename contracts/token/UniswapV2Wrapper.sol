// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "../interfaces/IUniswapV2Router02Wrapper.sol";
import "../interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV2Wrapper is IUniswapV2Router02Wrapper {
    IUniswapV2Router02 public uniswapV2Router;

    constructor(IUniswapV2Router02 _uniswapV2Router) {
        uniswapV2Router = _uniswapV2Router;
    }

    receive() external payable {}

    function factory() external view returns (address) {
        return uniswapV2Router.factory();
    }

    function WETH() external view returns (address) {
        return uniswapV2Router.WETH();
    }

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint256 deadline
    ) external payable {
        IERC20(token).approve(address(uniswapV2Router), amountTokenDesired);

        // add the liquidity
        (uint256 amountToken, uint256 amountETH, ) = uniswapV2Router
            .addLiquidityETH{value: msg.value}(
            token,
            amountTokenDesired,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );

        if (msg.value > amountETH) {
            (bool success, ) = msg.sender.call{value: msg.value - amountETH}(
                ""
            );
            require(success, "Transfer failed.");
        }

        if (amountTokenDesired > amountToken) {
            IERC20(token).transfer(
                msg.sender,
                amountTokenDesired - amountToken
            );
        }
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable {
        uint256[] memory amounts = uniswapV2Router.swapExactETHForTokens{
            value: msg.value
        }(amountOutMin, path, address(this), deadline);

        // send the token to the user
        IERC20(path[path.length - 1]).transfer(to, amounts[amounts.length - 1]);
    }
}
