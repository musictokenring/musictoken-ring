import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
})

export default wagmiConfig
