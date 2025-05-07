import { ComponentPill } from './component/ComponentPill';

interface Props {
  componentIds: string[];
}

export const ComponentBar: React.FC<Props> = (props) => {
  const { componentIds } = props;

  return (
    <div className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {componentIds.map((id) => (
        <ComponentPill key={id} componentId={id} />
      ))}
    </div>
  );
};
