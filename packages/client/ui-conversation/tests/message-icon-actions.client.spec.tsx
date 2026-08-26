// @vitest-environment jsdom
// MessageIconActions model tag: subagent turn tails append `· provider/model`
// after the timing facts; views without a model fact omit it entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { MessageIconActions } from '../src/client/chat/MessageIconActions.tsx'
import { en, zh } from '../src/client/locales.ts'

const t = makeTranslate(en, commonEn)

describe('MessageIconActions model tag', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('appends provider/model after the timing facts when provided', () => {
    const view = render(<MessageIconActions
      text="answer" time={1_700_000_000_000} runMs={5_000} ttftMs={1_200}
      tokensPerSecond={72} model={{ provider: 'oc', model: 'oc/big-pickle' }}
      clock="end" t={t}
    />)
    expect(view.container.textContent).toContain('· oc/oc/big-pickle')
  })

  it('renders nothing extra without a model fact', () => {
    const view = render(<MessageIconActions
      text="answer" time={1_700_000_000_000} clock="end" t={t}
    />)
    expect(view.container.textContent).not.toContain('·')
  })

  it('resolves through the conversation namespace in both locales', () => {
    const tZh = makeTranslate(zh, commonZh)
    const zhView = render(<MessageIconActions
      text="a" time={1} model={{ provider: 'cx', model: 'gpt' }} clock="end" t={tZh}
    />)
    expect(zhView.container.textContent).toContain('· cx/gpt')
    const enView = render(<MessageIconActions
      text="a" time={1} model={{ provider: 'cx', model: 'gpt' }} clock="end" t={t}
    />)
    expect(enView.container.textContent).toContain('· cx/gpt')
  })
})
