import type { Line } from '~/client';
import { ComponentPill } from './component/ComponentPill';

interface Props {
  components: Line[];
}

export const ComponentBar: React.FC<Props> = (props) => {
  const { components } = props;

  return (
    <div className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {components.map((component) => (
        <ComponentPill key={component.id} component={component} />
      ))}
    </div>
  );
};
