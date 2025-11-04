export type IssueCardContext =
  | {
      type: 'now';
    }
  | {
      type: 'history.week';
      date: string; // ISO Date
    }
  | {
      type: 'history.days';
      date: string; // ISO Date
      days: number;
    };
