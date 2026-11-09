export function mixedDiagnosticRequest() {
  return {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'feedback',
    target: 'diagnostic',
    exam: 'english2',
    day: '2026-10-30',
    sources: [],
    feedbackVersion: 2,
    dimensionContract: 'writing-dimensions-v1',
    task: [
      '分析主干：The tool which we use works well.',
      '补全固定搭配：We are interested ___ science. 只填介词。',
      '译成英文：欢迎参加科学展。',
      '拆分从句与主句：The scientist, who visited us, is helpful.',
      '提取写作要点：Write an email to classmates to introduce a science fair and invite them. About 100 words.'
    ].join('\n'),
    input: [
      '主干The tool works well，which we use修饰tool，which作use的宾语。',
      'at',
      'Welcome to the science fair.',
      '主句The scientist is helpful，who visited us修饰scientist，who作visited的主语。',
      '写给同学的邀请邮件，介绍科学展并邀请参与，约100词。'
    ].join('\n')
  };
}

export function mixedDiagnosticReply(config) {
  return {
    quoteVersion: config.writingOutput.schema.properties.quoteVersion.enum[0],
    message: 'AI评估',
    lines: [{ quoteId: 'q2', advice: '核对固定搭配所需的介词，再填回原句。' }],
    errors: [
      {
        label: '固定搭配介词选择错误',
        quoteId: 'q2',
        dimension: '搭配',
        errorText: 'at',
        replacement: null,
        rule: 'be interested in 是固定搭配，介词用 in'
      }
    ],
    strengths: [],
    uncertainties: [],
    phrases: [],
    dimensionReviews: Object.fromEntries(
      ['grammar', 'collocation', 'expression', 'task'].map((key) => [
        key,
        { comment: key === 'collocation' ? '固定搭配中的介词选择有误' : '已达到本次要求' }
      ])
    )
  };
}

export function mixedDiagnosticVerification() {
  return {
    blanks: [{ id: 'b1', accepted: ['in'], label: 'interested in', rule: 'interested 后固定用 in' }],
    syntax: [
      {
        id: 's1',
        hasRelativeClause: true,
        mainSubject: 'The tool',
        mainVerb: 'works',
        clause: 'which we use',
        antecedent: 'tool',
        pronoun: 'which',
        clauseSubject: 'we',
        clauseVerb: 'use',
        pronounRole: '宾语',
        note: '主干The tool works，which we use修饰tool，which作use的宾语'
      },
      {
        id: 's2',
        hasRelativeClause: true,
        mainSubject: 'The scientist',
        mainVerb: 'is',
        clause: 'who visited us',
        antecedent: 'scientist',
        pronoun: 'who',
        clauseSubject: 'who',
        clauseVerb: 'visited',
        pronounRole: '主语',
        note: '主干The scientist is helpful，who visited us修饰scientist，who作从句主语'
      }
    ]
  };
}
