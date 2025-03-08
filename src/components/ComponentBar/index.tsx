import { ComponentPill } from './component/ComponentPill';

interface Props {
  componentIds: string[];
}

export const ComponentBar: React.FC<Props> = (props) => {
  const { componentIds } = props;

  return (
    <div className="inline-flex items-center gap-x-1">
      {componentIds.map((id) => (
        <ComponentPill key={id} componentId={id} />
      ))}
    </div>
  );
};
