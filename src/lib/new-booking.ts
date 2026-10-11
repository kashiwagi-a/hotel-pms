/** インジケーターから作る予約（電話・飛び込みなど）の選択肢 */

/** 決済方法。「現地」を含むものは、チェックイン時にフロントで受け取る */
export const NEW_BOOKING_SETTLEMENTS = [
  { value: '現地決済', label: '現地決済（フロントで精算）', onSite: true },
  { value: '精算不要（事前決済・法人決済）', label: '事前決済・法人決済（精算不要）', onSite: false },
] as const;

export const NEW_BOOKING_CHANNELS = ['直接（フロント）', '電話', '飛び込み', 'メール', '法人'] as const;

export const MAX_NEW_BOOKING_NIGHTS = 30;
