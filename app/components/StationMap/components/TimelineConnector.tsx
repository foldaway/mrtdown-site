interface TimelineConnectorProps {
  isBlueTransition?: boolean;
}

export const TimelineConnector: React.FC<TimelineConnectorProps> = ({
  isBlueTransition = false,
}) => {
  const gradientColor = isBlueTransition
    ? 'from-slate-600 to-blue-500 dark:from-slate-700 dark:to-blue-600'
    : 'from-slate-600 to-transparent dark:from-slate-700';

  return <div className={`h-px flex-1 bg-gradient-to-r ${gradientColor}`} />;
};
