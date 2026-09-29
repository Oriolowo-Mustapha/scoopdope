import { render } from '@testing-library/react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { ProgressBar } from '../ProgressBar';
import { Spinner } from '../Spinner';

describe('UI component snapshots', () => {
  it.each(['primary', 'secondary', 'outline', 'ghost', 'success'] as const)(
    'Button variant=%s',
    (variant) => {
      const { container } = render(<Button variant={variant}>Click</Button>);
      expect(container.firstChild).toMatchSnapshot();
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('Button size=%s', (size) => {
    const { container } = render(<Button size={size}>Click</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['default', 'success', 'warning', 'error'] as const)('Badge variant=%s', (variant) => {
    const { container } = render(<Badge variant={variant}>Label</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('Card', () => {
    const { container } = render(<Card className="extra">Content</Card>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each([
    [0, undefined],
    [42, 'Course progress'],
    [150, 'Clamped'],
  ])('ProgressBar value=%s label=%s', (value, label) => {
    const { container } = render(<ProgressBar value={value} label={label} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['sm', 'md', 'lg'] as const)('Spinner size=%s', (size) => {
    const { container } = render(<Spinner size={size} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
