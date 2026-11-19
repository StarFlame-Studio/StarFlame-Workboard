import { ulid } from 'ulid'

export function newId(): string {
  return ulid()
}

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** 随机码（大小写不敏感场景），默认 6 位 */
export function newJoinCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

/** 班级码：6 位大写字母数字 */
export function newClassCode(): string {
  return newJoinCode(6)
}

/** 班级ID：C + 11 位大写字母数字，需谨慎保存 */
export function newClassUid(): string {
  return 'C' + newJoinCode(11)
}

/** 授权码：10 位大写字母数字 */
export function newAccessCode(): string {
  return newJoinCode(10)
}

export function newPassword(length = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}
