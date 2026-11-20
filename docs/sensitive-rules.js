// Generated from sensitive-rules.json.
export const patterns=[
  {"label":"姓名字段候选","pattern":"(?:姓名|名字|联系人|Name)[ \\t]*[:：=][ \\t]*([\\u4e00-\\u9fff]{2,6}|[A-Za-z][A-Za-z .'-]{1,60})","flags":"i"},
  {"label":"身份证号码候选","pattern":"(?<![A-Za-z0-9])[1-9][0-9]{5}(?:18|19|20)[0-9]{2}[01][0-9][0-3][0-9][0-9]{3}[0-9Xx](?![A-Za-z0-9])","flags":""},
  {"label":"中国大陆手机号候选","pattern":"(?<![0-9])(?:\\+?86[- ]?)?1[3-9][0-9]{9}(?![0-9])","flags":""},
  {"label":"GitHub PAT / token 候选","pattern":"(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})(?![A-Za-z0-9_])","flags":""},
  {"label":"API key 候选","pattern":"(?<![A-Za-z0-9])(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,255}|(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{16,255}|AIza[A-Za-z0-9_-]{30,45})(?![A-Za-z0-9_])","flags":""},
  {"label":"密钥 / token 配置候选","pattern":"(?:api[_ -]?key|access[_ -]?token|auth[_ -]?token|personal[_ -]?access[_ -]?token|PAT)[\\\"' \\t]*[:=][\\\"' \\t]*[A-Za-z0-9_./+=-]{12,512}","flags":"i"},
  {"label":"私钥标记","pattern":"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----","flags":""},
  {"label":"AWS access key 候选","pattern":"(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])","flags":""}
]
;
