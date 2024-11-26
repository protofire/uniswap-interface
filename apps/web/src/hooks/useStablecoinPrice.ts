import { Currency, CurrencyAmount, Price, Token, TradeType } from '@uniswap/sdk-core'
import { useAccount } from 'hooks/useAccount'
import tryParseCurrencyAmount from 'lib/utils/tryParseCurrencyAmount'
import { useMemo, useRef } from 'react'
import { ClassicTrade, INTERNAL_ROUTER_PREFERENCE_PRICE, TradeState } from 'state/routing/types'
import { useRoutingAPITrade } from 'state/routing/useRoutingAPITrade'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'

/**
 * Returns the price in USDC of the input currency
 * @param currency currency to compute the USDC price of
 */
export default function useStablecoinPrice(currency?: Currency): {
  price?: Price<Currency, Token>
  state: TradeState
} {
  const chainId = useSupportedChainId(currency?.chainId)
  const amountOut = chainId ? getChainInfo(chainId).spotPriceStablecoinAmount : undefined
  const stablecoin = amountOut?.currency

  const { trade, state } = useRoutingAPITrade(
    false /* skip */,
    TradeType.EXACT_OUTPUT,
    amountOut,
    currency,
    INTERNAL_ROUTER_PREFERENCE_PRICE,
  )
  const price = useMemo(() => {
    if (!currency || !stablecoin) {
      return undefined
    }

    // handle usdc
    if (currency?.wrapped.equals(stablecoin)) {
      return new Price(stablecoin, stablecoin, '1', '1')
    }

    // if initial quoting fails, we may end up with a DutchOrderTrade
    if (trade && trade instanceof ClassicTrade) {
      const { numerator, denominator } = trade.routes[0].midPrice
      return new Price(currency, stablecoin, denominator, numerator)
    }

    return undefined
  }, [currency, stablecoin, trade])

  const lastPrice = useRef(price)
  if (
    !price ||
    !lastPrice.current ||
    !price.equalTo(lastPrice.current) ||
    !price.baseCurrency.equals(lastPrice.current.baseCurrency)
  ) {
    lastPrice.current = price
  }
  return { price: lastPrice.current, state }
}

export function useStablecoinValue(currencyAmount: CurrencyAmount<Currency> | undefined | null) {
  const { price } = useStablecoinPrice(currencyAmount?.currency)

  return useMemo(() => {
    if (!price || !currencyAmount) {
      return null
    }
    try {
      return price.quote(currencyAmount)
    } catch (error) {
      return null
    }
  }, [currencyAmount, price])
}

/**
 *
 * @param fiatValue string representation of a USD amount
 * @returns CurrencyAmount where currency is stablecoin on active chain
 */
export function useStablecoinAmountFromFiatValue(fiatValue: number | null | undefined) {
  const { chainId } = useAccount()
  const supportedChainId = useSupportedChainId(chainId)
  const stablecoin = supportedChainId ? getChainInfo(supportedChainId).spotPriceStablecoinAmount.currency : undefined

  return useMemo(() => {
    if (fiatValue === null || fiatValue === undefined || !chainId || !stablecoin) {
      return undefined
    }

    // trim for decimal precision when parsing
    const parsedForDecimals = fiatValue.toFixed(stablecoin.decimals).toString()
    try {
      // parse USD string into CurrencyAmount based on stablecoin decimals
      return tryParseCurrencyAmount(parsedForDecimals, stablecoin)
    } catch (error) {
      return undefined
    }
  }, [chainId, fiatValue, stablecoin])
}
