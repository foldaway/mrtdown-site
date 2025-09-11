export type IssueCardContext =
  | {
      type: 'now';
    }
  | {
      type: 'history.week';
      date: string; // ISO Date
    };
