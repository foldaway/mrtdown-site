import { useMemo } from 'react';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { LinePill } from './component/LinePill';

interface Props {
  lineIds: string[];
  linkLines?: boolean;
}

export const LineBar: React.FC<Props> = (props) => {
  const { lineIds, linkLines = true } = props;

  const included = useIncludedEntities();
  const lines = useMemo(() => {
    return lineIds.map((id) => included.lines[id]);
  }, [lineIds, included.lines]);

  return (
    <div className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {lines.map((component) => (
        <LinePill key={component.id} component={component} linked={linkLines} />
      ))}
    </div>
  );
};
