import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import {
  createObeBlueprintRequest,
  deleteObeBlueprintRequest,
  fetchObeBlueprints,
  fetchObeMarkEntry,
  fetchObeOutput,
  fetchObeSetup,
  saveObeMarksRequest,
  saveObeSetupRequest,
  updateObeBlueprintRequest,
} from '../../services/obeService';

const defaultLevels = [
  { min: 70, max: 100, level: 4 },
  { min: 60, max: 69.99, level: 3 },
  { min: 50, max: 59.99, level: 2 },
  { min: 40, max: 49.99, level: 1 },
  { min: 0, max: 39.99, level: 0 },
];

const emptySetup = {
  thresholdPercent: 40,
  courseOutcomes: [{ code: 'CO1', statement: '', order: 0 }],
  poStatements: [{ code: 'PO1', statement: '', order: 0 }],
  psoStatements: [],
  mappings: [],
  attainmentLevels: defaultLevels,
  notes: '',
};

const emptyBlueprint = {
  assessmentName: '',
  assessmentType: 'ct',
  totalMarks: 0,
  order: 0,
  notes: '',
  items: [{ key: 'q1', label: 'Q1', marks: 0, coCode: '', order: 0 }],
};

const toast = (icon, title) =>
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: 1800,
  });

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export default function TabObe({ courseId, course }) {
  const [activeSubtab, setActiveSubtab] = useState('setup');

  const [setup, setSetup] = useState(emptySetup);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupSaving, setSetupSaving] = useState(false);

  const [blueprints, setBlueprints] = useState([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [blueprintForm, setBlueprintForm] = useState(emptyBlueprint);
  const [editingBlueprintId, setEditingBlueprintId] = useState(null);
  const [blueprintSaving, setBlueprintSaving] = useState(false);

  const [markStudents, setMarkStudents] = useState([]);
  const [markBlueprints, setMarkBlueprints] = useState([]);
  const [markDraft, setMarkDraft] = useState({});
  const [markLoading, setMarkLoading] = useState(true);
  const [markSaving, setMarkSaving] = useState(false);

  const [outputData, setOutputData] = useState(null);
  const [outputLoading, setOutputLoading] = useState(false);

  const coOptions = useMemo(
    () => (setup.courseOutcomes || []).filter((row) => row.code && row.statement),
    [setup.courseOutcomes]
  );

  useEffect(() => {
    loadSetup();
    loadBlueprints();
    loadMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (activeSubtab === 'output') {
      loadOutput();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubtab]);

  const loadSetup = async () => {
    try {
      setSetupLoading(true);
      const data = await fetchObeSetup(courseId);
      setSetup({
        thresholdPercent: data?.thresholdPercent ?? 40,
        courseOutcomes: data?.courseOutcomes?.length ? data.courseOutcomes : emptySetup.courseOutcomes,
        poStatements: data?.poStatements?.length ? data.poStatements : emptySetup.poStatements,
        psoStatements: data?.psoStatements || [],
        mappings: data?.mappings || [],
        attainmentLevels: data?.attainmentLevels?.length ? data.attainmentLevels : defaultLevels,
        notes: data?.notes || '',
      });
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to load OBE setup.');
    } finally {
      setSetupLoading(false);
    }
  };

  const loadBlueprints = async () => {
    try {
      setBlueprintsLoading(true);
      const data = await fetchObeBlueprints(courseId);
      setBlueprints(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to load OBE blueprints.');
    } finally {
      setBlueprintsLoading(false);
    }
  };

  const loadMarks = async () => {
    try {
      setMarkLoading(true);
      const data = await fetchObeMarkEntry(courseId);
      const students = Array.isArray(data?.students) ? data.students : [];
      const loadedBlueprints = Array.isArray(data?.blueprints) ? data.blueprints : [];
      const marks = Array.isArray(data?.marks) ? data.marks : [];

      const draft = {};
      for (const student of students) {
        for (const blueprint of loadedBlueprints) {
          const key = `${student.studentId}__${blueprint._id}`;
          draft[key] = {};
          for (const item of blueprint.items || []) {
            draft[key][item.key] = '';
          }
        }
      }

      for (const mark of marks) {
        const key = `${mark.student}__${mark.blueprint}`;
        if (!draft[key]) draft[key] = {};
        for (const entry of mark.entries || []) {
          draft[key][entry.itemKey] = entry.obtainedMarks;
        }
      }

      setMarkStudents(students);
      setMarkBlueprints(loadedBlueprints);
      setMarkDraft(draft);
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to load OBE marks.');
    } finally {
      setMarkLoading(false);
    }
  };

  const loadOutput = async () => {
    try {
      setOutputLoading(true);
      const data = await fetchObeOutput(courseId);
      setOutputData(data);
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to load OBE output.');
    } finally {
      setOutputLoading(false);
    }
  };

  const updateArrayRow = (field, index, key, value) => {
    setSetup((prev) => ({
      ...prev,
      [field]: (prev[field] || []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const addArrayRow = (field, prefix) => {
    setSetup((prev) => ({
      ...prev,
      [field]: [
        ...(prev[field] || []),
        { code: `${prefix}${(prev[field] || []).length + 1}`, statement: '', order: (prev[field] || []).length },
      ],
    }));
  };

  const removeArrayRow = (field, index) => {
    setSetup((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const addMappingRow = () => {
    setSetup((prev) => ({
      ...prev,
      mappings: [...(prev.mappings || []), { coCode: '', targetType: 'PO', targetCode: '', strength: 1 }],
    }));
  };

  const updateMappingRow = (index, key, value) => {
    setSetup((prev) => ({
      ...prev,
      mappings: (prev.mappings || []).map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const removeMappingRow = (index) => {
    setSetup((prev) => ({
      ...prev,
      mappings: (prev.mappings || []).filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const saveSetup = async () => {
    try {
      setSetupSaving(true);
      await saveObeSetupRequest(courseId, setup);
      toast('success', 'OBE setup saved successfully.');
      await Promise.all([loadSetup(), loadMarks()]);
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to save OBE setup.');
    } finally {
      setSetupSaving(false);
    }
  };

  const updateBlueprintRow = (index, key, value) => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: prev.items.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      ),
    }));
  };

  const addBlueprintRow = () => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: `q${prev.items.length + 1}`,
          label: `Q${prev.items.length + 1}`,
          marks: 0,
          coCode: coOptions[0]?.code || '',
          order: prev.items.length,
        },
      ],
    }));
  };

  const removeBlueprintRow = (index) => {
    setBlueprintForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const resetBlueprintForm = () => {
    setEditingBlueprintId(null);
    setBlueprintForm({
      ...emptyBlueprint,
      items: [{ key: 'q1', label: 'Q1', marks: 0, coCode: coOptions[0]?.code || '', order: 0 }],
    });
  };

  const saveBlueprint = async () => {
    try {
      setBlueprintSaving(true);
      if (editingBlueprintId) {
        await updateObeBlueprintRequest(courseId, editingBlueprintId, blueprintForm);
        toast('success', 'Blueprint updated successfully.');
      } else {
        await createObeBlueprintRequest(courseId, blueprintForm);
        toast('success', 'Blueprint created successfully.');
      }
      resetBlueprintForm();
      await Promise.all([loadBlueprints(), loadMarks()]);
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to save blueprint.');
    } finally {
      setBlueprintSaving(false);
    }
  };

  const startEditBlueprint = (blueprint) => {
    setEditingBlueprintId(blueprint._id);
    setBlueprintForm({
      assessmentName: blueprint.assessmentName,
      assessmentType: blueprint.assessmentType,
      totalMarks: blueprint.totalMarks,
      order: blueprint.order || 0,
      notes: blueprint.notes || '',
      items: (blueprint.items || []).map((item, index) => ({
        key: item.key,
        label: item.label,
        marks: item.marks,
        coCode: item.coCode,
        order: item.order ?? index,
      })),
    });
    setActiveSubtab('blueprint');
  };

  const deleteBlueprint = async (blueprintId) => {
    const result = await Swal.fire({
      title: 'Delete blueprint?',
      text: 'This will remove the saved assessment blueprint.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc2626',
    });

    if (!result.isConfirmed) return;

    try {
      await deleteObeBlueprintRequest(courseId, blueprintId);
      toast('success', 'Blueprint deleted successfully.');
      await Promise.all([loadBlueprints(), loadMarks()]);
      if (editingBlueprintId === blueprintId) resetBlueprintForm();
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to delete blueprint.');
    }
  };

  const handleDraftChange = (studentId, blueprintId, itemKey, rawValue, maxMarks) => {
    let value = rawValue;
    if (value === '') {
      setMarkDraft((prev) => ({
        ...prev,
        [`${studentId}__${blueprintId}`]: {
          ...(prev[`${studentId}__${blueprintId}`] || {}),
          [itemKey]: '',
        },
      }));
      return;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const clamped = Math.max(0, Math.min(numeric, Number(maxMarks || 0)));

    setMarkDraft((prev) => ({
      ...prev,
      [`${studentId}__${blueprintId}`]: {
        ...(prev[`${studentId}__${blueprintId}`] || {}),
        [itemKey]: clamped,
      },
    }));
  };

  const getDraftValue = (studentId, blueprintId, itemKey) => {
    const key = `${studentId}__${blueprintId}`;
    return markDraft[key]?.[itemKey] ?? '';
  };

  const getAssessmentDraftTotal = (studentId, blueprint) => {
    return round2(
      (blueprint.items || []).reduce((sum, item) => {
        const val = Number(getDraftValue(studentId, blueprint._id, item.key) || 0);
        return sum + val;
      }, 0)
    );
  };

  const saveMarks = async () => {
    try {
      setMarkSaving(true);
      const records = [];
      for (const student of markStudents) {
        for (const blueprint of markBlueprints) {
          records.push({
            studentId: student.studentId,
            blueprintId: blueprint._id,
            entries: (blueprint.items || []).map((item) => ({
              itemKey: item.key,
              obtainedMarks: Number(getDraftValue(student.studentId, blueprint._id, item.key) || 0),
            })),
          });
        }
      }

      await saveObeMarksRequest(courseId, { records });
      toast('success', 'OBE marks saved successfully.');
      await loadOutput();
    } catch (error) {
      console.error(error);
      toast('error', error?.response?.data?.message || 'Failed to save OBE marks.');
    } finally {
      setMarkSaving(false);
    }
  };

  const targetCodeOptions = (targetType) =>
    targetType === 'PSO' ? setup.psoStatements || [] : setup.poStatements || [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-50/60 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">OBE / CO-PO Module</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Standalone OBE workspace for {course?.code} — setup, blueprint, OBE mark entry, and attainment output.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['setup', 'Setup'],
              ['blueprint', 'Assessment Blueprint'],
              ['marks', 'OBE Mark Entry'],
              ['output', 'OBE Output'],
              ['crr', 'CRR'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSubtab(id)}
                className={[
                  'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
                  activeSubtab === id
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSubtab === 'setup' && (
        <div className="space-y-6">
          <SectionCard title="Threshold and Attainment Rules" subtitle="Store threshold percent and level rules used later in output and CRR.">
            {setupLoading ? (
              <div className="text-sm text-slate-500">Loading setup...</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <FormField label="Threshold Percent">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={setup.thresholdPercent}
                    onChange={(e) => setSetup((prev) => ({ ...prev, thresholdPercent: e.target.value }))}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Notes">
                  <input
                    value={setup.notes}
                    onChange={(e) => setSetup((prev) => ({ ...prev, notes: e.target.value }))}
                    className={inputClass}
                    placeholder="Optional notes for this course OBE setup"
                  />
                </FormField>
                <div className="lg:col-span-2">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr>
                          <HeaderCell>Min %</HeaderCell>
                          <HeaderCell>Max %</HeaderCell>
                          <HeaderCell>Level</HeaderCell>
                        </tr>
                      </thead>
                      <tbody>
                        {(setup.attainmentLevels || []).map((row, index) => (
                          <tr key={`level-${index}`} className="border-t border-slate-200 dark:border-slate-800">
                            <BodyCell>
                              <input
                                type="number"
                                value={row.min}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = { ...next[index], min: e.target.value };
                                  setSetup((prev) => ({ ...prev, attainmentLevels: next }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>
                            <BodyCell>
                              <input
                                type="number"
                                value={row.max}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = { ...next[index], max: e.target.value };
                                  setSetup((prev) => ({ ...prev, attainmentLevels: next }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>
                            <BodyCell>
                              <input
                                type="number"
                                value={row.level}
                                onChange={(e) => {
                                  const next = [...setup.attainmentLevels];
                                  next[index] = { ...next[index], level: e.target.value };
                                  setSetup((prev) => ({ ...prev, attainmentLevels: next }));
                                }}
                                className={inputClass}
                              />
                            </BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <OutcomeBlock
            title="Course Outcomes (CO)"
            rows={setup.courseOutcomes}
            onAdd={() => addArrayRow('courseOutcomes', 'CO')}
            onRemove={(index) => removeArrayRow('courseOutcomes', index)}
            onChange={(index, key, value) => updateArrayRow('courseOutcomes', index, key, value)}
          />

          <OutcomeBlock
            title="Program Outcomes (PO)"
            rows={setup.poStatements}
            onAdd={() => addArrayRow('poStatements', 'PO')}
            onRemove={(index) => removeArrayRow('poStatements', index)}
            onChange={(index, key, value) => updateArrayRow('poStatements', index, key, value)}
          />

          <OutcomeBlock
            title="Program Specific Outcomes (PSO)"
            rows={setup.psoStatements}
            onAdd={() => addArrayRow('psoStatements', 'PSO')}
            onRemove={(index) => removeArrayRow('psoStatements', index)}
            onChange={(index, key, value) => updateArrayRow('psoStatements', index, key, value)}
          />

          <SectionCard title="CO to PO / PSO Mapping" subtitle="Add mapping strength 1, 2, or 3 between each CO and PO / PSO.">
            <div className="space-y-4">
              <div className="flex justify-end">
                <button type="button" onClick={addMappingRow} className={secondaryButtonClass}>Add Mapping</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <HeaderCell>CO</HeaderCell>
                      <HeaderCell>Target Type</HeaderCell>
                      <HeaderCell>Target Code</HeaderCell>
                      <HeaderCell>Strength</HeaderCell>
                      <HeaderCell>Action</HeaderCell>
                    </tr>
                  </thead>
                  <tbody>
                    {(setup.mappings || []).map((row, index) => (
                      <tr key={`mapping-${index}`} className="border-t border-slate-200 dark:border-slate-800">
                        <BodyCell>
                          <select value={row.coCode} onChange={(e) => updateMappingRow(index, 'coCode', e.target.value)} className={inputClass}>
                            <option value="">Select CO</option>
                            {coOptions.map((co) => (
                              <option key={co.code} value={co.code}>{co.code}</option>
                            ))}
                          </select>
                        </BodyCell>
                        <BodyCell>
                          <select value={row.targetType} onChange={(e) => updateMappingRow(index, 'targetType', e.target.value)} className={inputClass}>
                            <option value="PO">PO</option>
                            <option value="PSO">PSO</option>
                          </select>
                        </BodyCell>
                        <BodyCell>
                          <select value={row.targetCode} onChange={(e) => updateMappingRow(index, 'targetCode', e.target.value)} className={inputClass}>
                            <option value="">Select Target</option>
                            {targetCodeOptions(row.targetType).map((target) => (
                              <option key={target.code} value={target.code}>{target.code}</option>
                            ))}
                          </select>
                        </BodyCell>
                        <BodyCell>
                          <select value={row.strength} onChange={(e) => updateMappingRow(index, 'strength', Number(e.target.value))} className={inputClass}>
                            {[1, 2, 3].map((level) => <option key={level} value={level}>{level}</option>)}
                          </select>
                        </BodyCell>
                        <BodyCell>
                          <button type="button" onClick={() => removeMappingRow(index)} className={dangerButtonClass}>Remove</button>
                        </BodyCell>
                      </tr>
                    ))}
                    {!setup.mappings?.length && (
                      <tr>
                        <BodyCell colSpan={5} className="text-center text-slate-500">No mappings added yet.</BodyCell>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button type="button" onClick={saveSetup} disabled={setupSaving} className={primaryButtonClass}>
              {setupSaving ? 'Saving...' : 'Save OBE Setup'}
            </button>
          </div>
        </div>
      )}

      {activeSubtab === 'blueprint' && (
        <div className="space-y-6">
          <SectionCard title="Assessment Blueprint Form" subtitle="Create question or item-wise CO mapping for CT, Assignment, Mid, Final, or custom assessment.">
            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Assessment Name">
                <input value={blueprintForm.assessmentName} onChange={(e) => setBlueprintForm((prev) => ({ ...prev, assessmentName: e.target.value }))} className={inputClass} placeholder="CT 1 / Mid / Final" />
              </FormField>
              <FormField label="Assessment Type">
                <select value={blueprintForm.assessmentType} onChange={(e) => setBlueprintForm((prev) => ({ ...prev, assessmentType: e.target.value }))} className={inputClass}>
                  {['ct', 'assignment', 'mid', 'final', 'presentation', 'viva', 'lab', 'custom'].map((type) => (
                    <option key={type} value={type}>{type.toUpperCase()}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Total Marks">
                <input type="number" value={blueprintForm.totalMarks} onChange={(e) => setBlueprintForm((prev) => ({ ...prev, totalMarks: e.target.value }))} className={inputClass} />
              </FormField>
              <FormField label="Display Order">
                <input type="number" value={blueprintForm.order} onChange={(e) => setBlueprintForm((prev) => ({ ...prev, order: e.target.value }))} className={inputClass} />
              </FormField>
              <div className="lg:col-span-2">
                <FormField label="Notes">
                  <textarea value={blueprintForm.notes} onChange={(e) => setBlueprintForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${inputClass} min-h-24`} />
                </FormField>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Blueprint Items</h4>
                <button type="button" onClick={addBlueprintRow} className={secondaryButtonClass}>Add Item</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <HeaderCell>Key</HeaderCell>
                      <HeaderCell>Label</HeaderCell>
                      <HeaderCell>Marks</HeaderCell>
                      <HeaderCell>CO</HeaderCell>
                      <HeaderCell>Action</HeaderCell>
                    </tr>
                  </thead>
                  <tbody>
                    {blueprintForm.items.map((item, index) => (
                      <tr key={`item-${index}`} className="border-t border-slate-200 dark:border-slate-800">
                        <BodyCell><input value={item.key} onChange={(e) => updateBlueprintRow(index, 'key', e.target.value)} className={inputClass} /></BodyCell>
                        <BodyCell><input value={item.label} onChange={(e) => updateBlueprintRow(index, 'label', e.target.value)} className={inputClass} /></BodyCell>
                        <BodyCell><input type="number" value={item.marks} onChange={(e) => updateBlueprintRow(index, 'marks', e.target.value)} className={inputClass} /></BodyCell>
                        <BodyCell>
                          <select value={item.coCode} onChange={(e) => updateBlueprintRow(index, 'coCode', e.target.value)} className={inputClass}>
                            <option value="">Select CO</option>
                            {coOptions.map((co) => <option key={co.code} value={co.code}>{co.code}</option>)}
                          </select>
                        </BodyCell>
                        <BodyCell>
                          <button type="button" onClick={() => removeBlueprintRow(index)} className={dangerButtonClass}>Remove</button>
                        </BodyCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {editingBlueprintId && <button type="button" onClick={resetBlueprintForm} className={secondaryButtonClass}>Cancel Edit</button>}
              <button type="button" onClick={saveBlueprint} disabled={blueprintSaving} className={primaryButtonClass}>
                {blueprintSaving ? 'Saving...' : editingBlueprintId ? 'Update Blueprint' : 'Create Blueprint'}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Saved Assessment Blueprints" subtitle="These blueprints are used in OBE Mark Entry and OBE Output.">
            {blueprintsLoading ? (
              <div className="text-sm text-slate-500">Loading blueprints...</div>
            ) : (
              <div className="space-y-4">
                {blueprints.map((blueprint) => (
                  <div key={blueprint._id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{blueprint.assessmentName}</h4>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Type: {String(blueprint.assessmentType || '').toUpperCase()} · Total Marks: {blueprint.totalMarks}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditBlueprint(blueprint)} className={secondaryButtonClass}>Edit</button>
                        <button type="button" onClick={() => deleteBlueprint(blueprint._id)} className={dangerButtonClass}>Delete</button>
                      </div>
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/80">
                          <tr>
                            <HeaderCell>Label</HeaderCell>
                            <HeaderCell>Marks</HeaderCell>
                            <HeaderCell>CO</HeaderCell>
                          </tr>
                        </thead>
                        <tbody>
                          {(blueprint.items || []).map((item) => (
                            <tr key={item.key} className="border-t border-slate-200 dark:border-slate-800">
                              <BodyCell>{item.label}</BodyCell>
                              <BodyCell>{item.marks}</BodyCell>
                              <BodyCell>{item.coCode}</BodyCell>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {!blueprints.length && <div className="text-sm text-slate-500">No blueprints created yet.</div>}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {activeSubtab === 'marks' && (
        <div className="space-y-6">
          <SectionCard title="OBE Mark Entry" subtitle="Enter marks question-wise. The system will later calculate CO totals and attainment automatically.">
            {markLoading ? (
              <div className="text-sm text-slate-500">Loading mark entry data...</div>
            ) : !markStudents.length ? (
              <div className="text-sm text-slate-500">No students found in this course.</div>
            ) : !markBlueprints.length ? (
              <div className="text-sm text-slate-500">No OBE blueprints created yet. Create a blueprint first.</div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Students: <strong>{markStudents.length}</strong> · Assessments: <strong>{markBlueprints.length}</strong>
                  </div>
                  <button type="button" onClick={saveMarks} disabled={markSaving} className={primaryButtonClass}>
                    {markSaving ? 'Saving...' : 'Save OBE Marks'}
                  </button>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-[1200px] text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <HeaderCell className="sticky left-0 z-20 min-w-[190px] bg-slate-100 dark:bg-slate-800">Student</HeaderCell>
                        {markBlueprints.map((blueprint) => (
                          <HeaderCell key={blueprint._id} colSpan={(blueprint.items || []).length + 1} className="text-center">
                            {blueprint.assessmentName} ({blueprint.totalMarks})
                          </HeaderCell>
                        ))}
                      </tr>
                      <tr className="bg-slate-50 dark:bg-slate-900/70">
                        <HeaderCell className="sticky left-0 z-20 min-w-[190px] bg-slate-50 dark:bg-slate-900/70">Roll / Name</HeaderCell>
                        {markBlueprints.flatMap((blueprint) => [
                          ...(blueprint.items || []).map((item) => (
                            <HeaderCell key={`${blueprint._id}-${item.key}`} className="text-center">
                              <div>{item.label}</div>
                              <div className="text-[11px] font-medium text-slate-500">{item.coCode} · {item.marks}</div>
                            </HeaderCell>
                          )),
                          <HeaderCell key={`${blueprint._id}-total`} className="text-center">Total</HeaderCell>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {markStudents.map((student) => (
                        <tr key={student.studentId} className="border-t border-slate-200 dark:border-slate-800">
                          <BodyCell className="sticky left-0 z-10 min-w-[190px] bg-white dark:bg-slate-900">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">{student.roll}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{student.name}</div>
                          </BodyCell>
                          {markBlueprints.flatMap((blueprint) => [
                            ...(blueprint.items || []).map((item) => (
                              <BodyCell key={`${student.studentId}-${blueprint._id}-${item.key}`} className="text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.marks}
                                  step="0.01"
                                  value={getDraftValue(student.studentId, blueprint._id, item.key)}
                                  onChange={(e) => handleDraftChange(student.studentId, blueprint._id, item.key, e.target.value, item.marks)}
                                  className={`${inputClass} w-24 text-center`}
                                />
                              </BodyCell>
                            )),
                            <BodyCell key={`${student.studentId}-${blueprint._id}-total`} className="text-center font-semibold text-indigo-700 dark:text-indigo-300">
                              {getAssessmentDraftTotal(student.studentId, blueprint)}
                            </BodyCell>,
                          ])}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      )}

      {activeSubtab === 'output' && (
        <div className="space-y-6">
          <SectionCard title="OBE Output" subtitle="CO-wise student achievement, class attainment, PO attainment, and grade distribution.">
            {outputLoading ? (
              <div className="text-sm text-slate-500">Loading output...</div>
            ) : !outputData ? (
              <div className="text-sm text-slate-500">No output available yet.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Threshold" value={`${outputData.thresholdPercent}%`} />
                <MetricCard label="Students" value={outputData.totalStudents} />
                <MetricCard label="Assessments" value={outputData.blueprints?.length || 0} />
                <MetricCard label="Total Possible Marks" value={outputData.totalPossibleMarks} />
              </div>
            )}
          </SectionCard>

          {outputData && (
            <>
              <SectionCard title="Student CO Achievement" subtitle="Shows obtained marks, CO percentage, and achieved status per student.">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-[1100px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/80">
                      <tr>
                        <HeaderCell>Roll</HeaderCell>
                        <HeaderCell>Name</HeaderCell>
                        <HeaderCell>Total</HeaderCell>
                        <HeaderCell>%</HeaderCell>
                        <HeaderCell>Grade</HeaderCell>
                        {(outputData.coAttainment || []).flatMap((co) => [
                          <HeaderCell key={`${co.code}-obt`} className="text-center">{co.code} Obt</HeaderCell>,
                          <HeaderCell key={`${co.code}-pct`} className="text-center">{co.code} %</HeaderCell>,
                          <HeaderCell key={`${co.code}-yn`} className="text-center">{co.code} Y/N</HeaderCell>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {(outputData.students || []).map((student) => (
                        <tr key={student.studentId} className="border-t border-slate-200 dark:border-slate-800">
                          <BodyCell>{student.roll}</BodyCell>
                          <BodyCell>{student.name}</BodyCell>
                          <BodyCell>{student.courseObtained} / {student.courseMaxMarks}</BodyCell>
                          <BodyCell>{student.totalPercent}</BodyCell>
                          <BodyCell>{student.grade}</BodyCell>
                          {student.coRows.flatMap((co) => [
                            <BodyCell key={`${student.studentId}-${co.code}-obt`} className="text-center">{co.obtainedMarks}/{co.maxMarks}</BodyCell>,
                            <BodyCell key={`${student.studentId}-${co.code}-pct`} className="text-center">{co.percent}</BodyCell>,
                            <BodyCell key={`${student.studentId}-${co.code}-yn`} className="text-center">
                              <span className={co.achieved ? successBadgeClass : failBadgeClass}>{co.achieved ? 'Yes' : 'No'}</span>
                            </BodyCell>,
                          ])}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <div className="grid gap-6 xl:grid-cols-2">
                <SectionCard title="CO Attainment Summary" subtitle="Calculated from threshold-based student achievement count.">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/80">
                        <tr>
                          <HeaderCell>CO</HeaderCell>
                          <HeaderCell>Max</HeaderCell>
                          <HeaderCell>Threshold</HeaderCell>
                          <HeaderCell>Attained</HeaderCell>
                          <HeaderCell>Attainment %</HeaderCell>
                          <HeaderCell>Level</HeaderCell>
                        </tr>
                      </thead>
                      <tbody>
                        {(outputData.coAttainment || []).map((row) => (
                          <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                            <BodyCell>{row.code}</BodyCell>
                            <BodyCell>{row.maxMarks}</BodyCell>
                            <BodyCell>{row.thresholdMarks}</BodyCell>
                            <BodyCell>{row.attainedCount}/{row.totalStudents}</BodyCell>
                            <BodyCell>{row.attainmentPercent}</BodyCell>
                            <BodyCell>{row.level}</BodyCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="PO / PSO Attainment Summary" subtitle="Weighted from CO attainment using mapping strength 1, 2, and 3.">
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/80">
                          <tr>
                            <HeaderCell>PO</HeaderCell>
                            <HeaderCell>Attainment %</HeaderCell>
                            <HeaderCell>Level</HeaderCell>
                          </tr>
                        </thead>
                        <tbody>
                          {(outputData.poAttainment || []).map((row) => (
                            <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                              <BodyCell>{row.code}</BodyCell>
                              <BodyCell>{row.attainmentPercent}</BodyCell>
                              <BodyCell>{row.level}</BodyCell>
                            </tr>
                          ))}
                          {!outputData.poAttainment?.length && (
                            <tr><BodyCell colSpan={3} className="text-center text-slate-500">No PO rows found.</BodyCell></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {!!outputData.psoAttainment?.length && (
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 dark:bg-slate-800/80">
                            <tr>
                              <HeaderCell>PSO</HeaderCell>
                              <HeaderCell>Attainment %</HeaderCell>
                              <HeaderCell>Level</HeaderCell>
                            </tr>
                          </thead>
                          <tbody>
                            {(outputData.psoAttainment || []).map((row) => (
                              <tr key={row.code} className="border-t border-slate-200 dark:border-slate-800">
                                <BodyCell>{row.code}</BodyCell>
                                <BodyCell>{row.attainmentPercent}</BodyCell>
                                <BodyCell>{row.level}</BodyCell>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>

              <SectionCard title="Grade Distribution" subtitle="Based on total obtained marks scaled to percentage.">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/80">
                      <tr>
                        <HeaderCell>Grade</HeaderCell>
                        <HeaderCell>Count</HeaderCell>
                        <HeaderCell>Percent</HeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {(outputData.gradeDistribution || []).map((row) => (
                        <tr key={row.grade} className="border-t border-slate-200 dark:border-slate-800">
                          <BodyCell>{row.grade}</BodyCell>
                          <BodyCell>{row.count}</BodyCell>
                          <BodyCell>{row.percent}%</BodyCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}

      {activeSubtab === 'crr' && (
        <SectionCard title="Course Review Report" subtitle="Phase 5 will generate the CRR automatically as DOCX/PDF from OBE output and teacher remarks.">
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>This phase is now ready with the data foundation needed for CRR generation:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>course outcomes and mappings</li>
              <li>question-wise blueprint</li>
              <li>student-wise OBE mark entry</li>
              <li>CO attainment summary</li>
              <li>PO / PSO attainment summary</li>
              <li>grade distribution summary</li>
            </ul>
            <p>The next phase can generate a report format similar to your uploaded Course Review Report document.</p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4">
        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h4>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function OutcomeBlock({ title, rows, onAdd, onRemove, onChange }) {
  return (
    <SectionCard title={title} subtitle="Use clear code and full statement so the same data can later be shown in output and CRR.">
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onAdd} className={secondaryButtonClass}>Add Row</button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr>
              <HeaderCell>Code</HeaderCell>
              <HeaderCell>Statement</HeaderCell>
              <HeaderCell>Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row, index) => (
              <tr key={`${title}-${index}`} className="border-t border-slate-200 dark:border-slate-800">
                <BodyCell>
                  <input value={row.code} onChange={(e) => onChange(index, 'code', e.target.value)} className={inputClass} />
                </BodyCell>
                <BodyCell>
                  <textarea value={row.statement} onChange={(e) => onChange(index, 'statement', e.target.value)} className={`${inputClass} min-h-24`} />
                </BodyCell>
                <BodyCell>
                  <button type="button" onClick={() => onRemove(index)} className={dangerButtonClass}>Remove</button>
                </BodyCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      {children}
    </label>
  );
}

function HeaderCell({ children, className = '', colSpan }) {
  return <th colSpan={colSpan} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '', colSpan }) {
  return <td colSpan={colSpan} className={`px-4 py-3 align-top text-slate-700 dark:text-slate-200 ${className}`}>{children}</td>;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/20';
const primaryButtonClass = 'rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass = 'rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';
const dangerButtonClass = 'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20';
const successBadgeClass = 'inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
const failBadgeClass = 'inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300';
