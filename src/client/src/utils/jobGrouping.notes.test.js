import {
  splitNotesByJob,
  splitNotesByJobName,
  notesNotShownInGroups,
  normalizeLiveGroups,
  normalizeInvoiceGroups,
} from './jobGrouping';

// Notes filed against a job print inside that job's block on customer-facing
// documents; everything else falls through to the document-level Notes section.
describe('splitNotesByJob', () => {
  const brakes = { _id: 'svc-brakes', description: 'Front Brake Job' };
  const oil = { _id: 'svc-oil', description: 'Oil Change' };

  it('groups notes under the job they were filed against', () => {
    const notes = [
      { _id: 'n1', serviceId: 'svc-brakes', content: 'Rotors at min spec.' },
      { _id: 'n2', serviceId: 'svc-oil', content: 'Used 5W-40.' },
      { _id: 'n3', serviceId: 'svc-brakes', content: 'Customer approved.' },
    ];

    const { byServiceId, documentLevel } = splitNotesByJob(notes, [brakes, oil]);

    expect(byServiceId.get('svc-brakes').map((n) => n._id)).toEqual(['n1', 'n3']);
    expect(byServiceId.get('svc-oil').map((n) => n._id)).toEqual(['n2']);
    expect(documentLevel).toEqual([]);
  });

  it('treats a note with no serviceId as document-level', () => {
    const notes = [{ _id: 'n1', content: 'Vehicle held overnight.' }];

    const { byServiceId, documentLevel } = splitNotesByJob(notes, [brakes]);

    expect(byServiceId.size).toBe(0);
    expect(documentLevel.map((n) => n._id)).toEqual(['n1']);
  });

  it('falls back to document-level when the job no longer exists', () => {
    // The job was removed from the work order; the note must still be visible
    // rather than disappearing with its container.
    const notes = [{ _id: 'n1', serviceId: 'svc-gone', serviceName: 'Old Job', content: 'Still matters.' }];

    const { documentLevel } = splitNotesByJob(notes, [brakes]);

    expect(documentLevel.map((n) => n._id)).toEqual(['n1']);
  });
});

describe('splitNotesByJobName', () => {
  it('matches a saved invoice’s notes by denormalized job name', () => {
    const notes = [
      { _id: 'n1', serviceName: 'Front Brake Job', content: 'Rotors at min spec.' },
      { _id: 'n2', serviceName: 'Renamed Since', content: 'Orphan.' },
      { _id: 'n3', content: 'Work-order level.' },
    ];

    const { byName, documentLevel } = splitNotesByJobName(notes, ['Front Brake Job', 'Oil Change']);

    expect(byName.get('Front Brake Job').map((n) => n._id)).toEqual(['n1']);
    expect(documentLevel.map((n) => n._id)).toEqual(['n2', 'n3']);
  });
});

describe('normalizeLiveGroups with notes', () => {
  it('attaches each job’s notes to its group', () => {
    const services = [
      { _id: 'svc-brakes', description: 'Front Brake Job' },
      { _id: 'svc-oil', description: 'Oil Change' },
    ];
    const groups = normalizeLiveGroups({
      services,
      parts: [{ _id: 'p1', name: 'Rotors', serviceId: 'svc-brakes', quantity: 2, price: 100 }],
      labor: [{ _id: 'l1', description: 'Oil change labor', serviceId: 'svc-oil', quantity: 1, rate: 50 }],
      customerFacingNotes: [
        { _id: 'n1', serviceId: 'svc-brakes', content: 'Rotors at min spec.' },
        { _id: 'n2', content: 'Work-order level.' },
      ],
    });

    const brakeGroup = groups.find((g) => g.name === 'Front Brake Job');
    const oilGroup = groups.find((g) => g.name === 'Oil Change');
    expect(brakeGroup.notes.map((n) => n._id)).toEqual(['n1']);
    expect(oilGroup.notes).toEqual([]);
  });

  it('defaults notes to an empty array when none are passed', () => {
    const groups = normalizeLiveGroups({
      services: [{ _id: 'svc-oil', description: 'Oil Change' }],
      labor: [{ _id: 'l1', description: 'Labor', serviceId: 'svc-oil', quantity: 1, rate: 50 }],
    });

    expect(groups[0].notes).toEqual([]);
  });
});

describe('notesNotShownInGroups', () => {
  it('keeps a note whose job has no parts or labor to render', () => {
    // groupLinesByJob skips a service with no assigned lines, so nothing renders
    // that job's block — the note has to fall through to the document level
    // rather than disappear.
    const notes = [{ _id: 'n1', serviceId: 'svc-empty', content: 'Waiting on parts.' }];
    const groups = normalizeLiveGroups({
      services: [{ _id: 'svc-empty', description: 'Diagnose Noise' }],
      parts: [],
      labor: [],
      customerFacingNotes: notes,
    });

    expect(groups).toEqual([]);
    expect(notesNotShownInGroups(notes, groups).map((n) => n._id)).toEqual(['n1']);
  });

  it('drops notes already rendered inside a job block', () => {
    const notes = [
      { _id: 'n1', serviceId: 'svc-oil', content: 'Used 5W-40.' },
      { _id: 'n2', content: 'Work-order level.' },
    ];
    const groups = normalizeLiveGroups({
      services: [{ _id: 'svc-oil', description: 'Oil Change' }],
      labor: [{ _id: 'l1', description: 'Labor', serviceId: 'svc-oil', quantity: 1, rate: 50 }],
      customerFacingNotes: notes,
    });

    expect(notesNotShownInGroups(notes, groups).map((n) => n._id)).toEqual(['n2']);
  });
});

describe('normalizeInvoiceGroups with notes', () => {
  it('attaches notes to the saved invoice’s job groups by name', () => {
    const items = [
      { type: 'Part', jobName: 'Front Brake Job', description: 'Rotors', quantity: 2, unitPrice: 100, total: 200 },
      { type: 'Labor', jobName: 'Oil Change', description: 'Labor', quantity: 1, unitPrice: 50, total: 50 },
    ];
    const notes = [{ _id: 'n1', serviceName: 'Front Brake Job', content: 'Rotors at min spec.' }];

    const groups = normalizeInvoiceGroups(items, notes);

    expect(groups.find((g) => g.name === 'Front Brake Job').notes.map((n) => n._id)).toEqual(['n1']);
    expect(groups.find((g) => g.name === 'Oil Change').notes).toEqual([]);
  });
});
