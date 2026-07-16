interface TimelineConnectorProps {
  isBlueTransition?: boolean;
}

export const TimelineConnector: React.FC<TimelineConnectorProps> = ({
  isBlueTransition = false,
}) => {
  const gradientColor = isBlueTransition
    ? 'from-gray-200 to-blue-200 dark:from-gray-700 dark:to-blue-800'
    : 'from-gray-200 to-transparent dark:from-gray-700';

  return <div className={`h-px flex-1 bg-gradient-to-r ${gradientColor}`} />;
};
