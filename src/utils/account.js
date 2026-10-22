// Short words for the account's citizenship ("Singapore citizen since 1988"), used on Account and the Bill page.
export const citizenshipText = (t, user) =>
  user?.citizenship ? t(`auth.citizenships.${user.citizenship}`, { year: user.citizenSince ?? '' }) : '—'
