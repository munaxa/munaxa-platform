import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropzone, formatFileSize } from './dropzone.js';
import { FileManager, type FileNode } from './file-manager.js';
import type { FileRejection } from './dropzone.js';
import { expectNoA11yViolations } from '../../../test/setup.js';

/** `expect.any` is untyped, so rejections are asserted on their own fields instead. */
function rejections(mock: ReturnType<typeof vi.fn>): FileRejection[] {
  return (mock.mock.calls.at(-1)?.[0] ?? []) as FileRejection[];
}

function file(name: string, size = 1024, type = 'text/plain'): File {
  return new File(['x'.repeat(size)], name, { type });
}

describe('formatFileSize', () => {
  it('steps through binary units', () => {
    expect(formatFileSize(0, 'en-US')).toBe('0 B');
    expect(formatFileSize(999, 'en-US')).toBe('999 B');
    expect(formatFileSize(1024, 'en-US')).toBe('1 KB');
    expect(formatFileSize(1536, 'en-US')).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 * 3.2, 'en-US')).toBe('3.2 MB');
  });
});

describe('Dropzone', () => {
  it('is a real button, so there is a keyboard path into a drag-only interaction', async () => {
    const user = userEvent.setup();
    render(<Dropzone onFiles={() => {}} />);
    const zone = screen.getByRole('button', { name: /Drop files here/ });
    await user.tab();
    expect(zone).toHaveFocus();
  });

  it('hands over raw File objects and uploads nothing itself', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Dropzone onFiles={onFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [file('notes.txt')]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    const [files] = onFiles.mock.calls[0] as [File[]];
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0]?.name).toBe('notes.txt');
  });

  /**
   * Exercised through a drop rather than the picker, and that is the point: the browser applies
   * `accept` to a file *picker* but not to a *drop*, so the JS check is the only thing standing
   * between a dropped `.exe` and the product's upload handler.
   */
  it('rejects by type, and says why rather than dropping it silently', async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    render(<Dropzone onFiles={onFiles} onReject={onReject} accept=".pdf,image/*" />);
    const zone = screen.getByRole('button', { name: /Drop files here/ });
    fireEvent.drop(zone, { dataTransfer: { files: [file('notes.txt')] } });

    expect(onFiles).not.toHaveBeenCalled();
    expect(rejections(onReject).map((entry) => [entry.file.name, entry.reason])).toEqual([
      ['notes.txt', 'type'],
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'notes.txt is not an accepted type.',
    );
  });

  it('accepts a wildcard type and an extension', async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Dropzone onFiles={onFiles} accept="image/*,.pdf" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [file('photo.png', 10, 'image/png'), file('form.pdf', 10, '')]);
    const [files] = onFiles.mock.calls[0] as [File[]];
    expect(files.map((entry) => entry.name)).toEqual(['photo.png', 'form.pdf']);
  });

  it('rejects by size', async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Dropzone onFiles={() => {}} onReject={onReject} maxSize={100} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [file('big.txt', 500)]);
    expect(rejections(onReject).map((entry) => [entry.file.name, entry.reason])).toEqual([
      ['big.txt', 'size'],
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('big.txt is too large.');
  });

  it('splits a mixed drop into accepted and rejected', async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Dropzone onFiles={onFiles} onReject={onReject} maxSize={100} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [file('small.txt', 10), file('big.txt', 500)]);

    const [files] = onFiles.mock.calls[0] as [File[]];
    expect(files.map((entry) => entry.name)).toEqual(['small.txt']);
    expect(rejections(onReject).map((entry) => [entry.file.name, entry.reason])).toEqual([
      ['big.txt', 'size'],
    ]);
  });

  it('caps the count', async () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Dropzone onFiles={onFiles} onReject={onReject} maxFiles={1} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [file('a.txt', 10), file('b.txt', 10)]);
    const [files] = onFiles.mock.calls[0] as [File[]];
    expect(files).toHaveLength(1);
    expect(rejections(onReject).map((entry) => [entry.file.name, entry.reason])).toEqual([
      ['b.txt', 'count'],
    ]);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Dropzone onFiles={() => {}} labels={{ hint: 'PDF or PNG, up to 5 MB' }} />,
    );
    await expectNoA11yViolations(container);
  });
});

describe('FileManager', () => {
  const ITEMS: FileNode[] = [
    { id: 'f1', name: 'Reports', kind: 'folder' },
    { id: 'd1', name: 'Zebra.pdf', kind: 'file', size: 2048, modifiedAt: '2026-04-03' },
    { id: 'd2', name: 'Alpha.docx', kind: 'file', size: 512, modifiedAt: '2026-04-10' },
    { id: 'f2', name: 'Archive', kind: 'folder' },
  ];

  const PATH = [{ label: 'Documents', href: '/documents' }, { label: 'Term 2' }];

  function Manager(props: Partial<Parameters<typeof FileManager>[0]> = {}) {
    return (
      <FileManager aria-label="Documents" items={ITEMS} path={PATH} locale="en-GB" {...props} />
    );
  }

  it('shows the path as a breadcrumb with an accessible name', () => {
    render(<Manager />);
    const nav = screen.getByRole('navigation', { name: 'Folder path' });
    expect(within(nav).getByText('Documents')).toBeInTheDocument();
    expect(within(nav).getByText('Term 2')).toBeInTheDocument();
  });

  it('puts folders before files whatever order they arrived in', () => {
    render(<Manager />);
    const names = screen.getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names[0]).toContain('Reports');
    expect(names[1]).toContain('Archive');
  });

  it('is the platform DataGrid, so it sorts and is keyboard navigable', async () => {
    const user = userEvent.setup();
    render(<Manager />);
    await user.click(screen.getByRole('button', { name: /Size/ }));
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /Size/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      ),
    );
  });

  it('formats sizes and dates, and shows a dash where there is nothing', () => {
    render(<Manager />);
    expect(screen.getByRole('gridcell', { name: '2 KB' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: '10 Apr 2026' })).toBeInTheDocument();
    // Folders have neither.
    expect(screen.getAllByRole('gridcell', { name: '—' }).length).toBeGreaterThan(0);
  });

  it('navigates into a folder and opens a file, through separate callbacks', async () => {
    const onNavigate = vi.fn();
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<Manager onNavigate={onNavigate} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: 'Reports' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Zebra.pdf' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }));
  });

  it('announces whether each row is a folder or a file', () => {
    render(<Manager />);
    expect(screen.getByRole('rowheader', { name: /Reports Folder/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /Zebra\.pdf File/ })).toBeInTheDocument();
  });

  it('counts what is in the folder', () => {
    render(<Manager />);
    expect(screen.getByRole('status')).toHaveTextContent('2 folders, 2 files');
  });

  it('selects items when the caller wants a selection', async () => {
    const user = userEvent.setup();
    function Selectable() {
      const [ids, setIds] = useState<string[]>([]);
      return <Manager selectedIds={ids} onSelectionChange={setIds} />;
    }
    render(<Selectable />);
    await user.click(screen.getByRole('checkbox', { name: 'Select Reports' }));
    await waitFor(() => expect(screen.getAllByRole('row', { selected: true })).toHaveLength(1));
  });

  it('shows no dropzone until upload is possible', () => {
    const { rerender } = render(<Manager />);
    expect(screen.queryByRole('button', { name: /Drop files here/ })).not.toBeInTheDocument();
    rerender(<Manager onUpload={() => {}} />);
    expect(screen.getByRole('button', { name: /Drop files here/ })).toBeInTheDocument();
  });

  it('switches between list and grid without losing the items', async () => {
    const user = userEvent.setup();
    function Views() {
      const [view, setView] = useState<'list' | 'grid'>('list');
      return <Manager view={view} onViewChange={setView} />;
    }
    render(<Views />);
    const gridToggle = screen.getByRole('button', { name: 'Grid view', pressed: false });
    await user.click(gridToggle);
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
    // In grid view a tile's name carries its kind, so it reads as "Reports Folder".
    expect(screen.getByRole('button', { name: 'Reports Folder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid view', pressed: true })).toBeInTheDocument();
  });

  it('shows the empty folder state', () => {
    render(<Manager items={[]} />);
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
  });

  it('has no accessibility violations, in either view', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Manager onUpload={() => {}} onViewChange={() => {}} />);
    await expectNoA11yViolations(container);
    rerender(<Manager view="grid" onSelectionChange={() => {}} selectedIds={['f1']} />);
    await user.tab();
    await expectNoA11yViolations(container);
  });
});
