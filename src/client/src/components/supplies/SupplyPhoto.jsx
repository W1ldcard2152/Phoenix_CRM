import React, { useEffect, useRef, useState } from 'react';
import SupplyService from '../../services/supplyService';

/**
 * Item photo: pick a file, or click the zone and Ctrl+V a screenshot.
 *
 * The paste path follows the Worksheet's OfferCard — a focusable div with an
 * onPaste handler that pulls the first image/* item off the clipboard. The
 * difference is what happens next: OfferCard ships the blob to the AI decoder,
 * this stores it.
 *
 * Works before the supply exists. On a new item there is no id to POST to, so
 * `onPendingChange` hands the blob up to the form, which uploads it after the
 * create call returns. Otherwise pasting a photo would mean saving first and
 * coming back, which is exactly the kind of round trip the triage pass can't
 * afford.
 */
const SupplyPhoto = ({ supply, onPendingChange, onUploaded, disabled = false }) => {
  const [preview, setPreview] = useState(null);   // object URL for a pending blob
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const objectUrlRef = useRef(null);

  const savedUrl = SupplyService.photoUrl(supply);
  const shown = preview || savedUrl;

  // Revoke the previous object URL whenever it's replaced, and on unmount —
  // otherwise a long triage session leaks a blob per pasted screenshot.
  const setPreviewBlob = (blob) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    if (!blob) {
      objectUrlRef.current = null;
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setPreview(url);
  };

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const accept = async (blob) => {
    if (!blob) return;
    if (!blob.type || !blob.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    setError(null);
    setPreviewBlob(blob);

    // No id yet (creating): hand it to the form to upload after save.
    if (!supply?._id) {
      onPendingChange?.(blob);
      return;
    }

    setBusy(true);
    try {
      const res = await SupplyService.uploadPhoto(supply._id, blob);
      setPreviewBlob(null); // saved copy takes over
      onUploaded?.(res.data.supply);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.');
      setPreviewBlob(null);
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (!imgItem) return; // let non-image pastes fall through
    e.preventDefault();
    accept(imgItem.getAsFile());
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    accept(e.dataTransfer?.files?.[0]);
  };

  const remove = async () => {
    setError(null);
    setPreviewBlob(null);
    onPendingChange?.(null);
    if (!supply?._id || !supply.photoKey) return;
    setBusy(true);
    try {
      const res = await SupplyService.deletePhoto(supply._id);
      onUploaded?.(res.data.supply);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <div
          tabIndex={disabled ? -1 : 0}
          onPaste={disabled ? undefined : handlePaste}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={disabled ? undefined : handleDrop}
          title="Click here, then press Ctrl+V to paste a screenshot"
          className={`relative w-28 h-28 shrink-0 rounded border border-dashed flex items-center justify-center text-center overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            dragOver ? 'border-primary-500 bg-primary-50' : 'border-gray-300 bg-gray-50'
          } ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-primary-400'}`}
        >
          {shown ? (
            <img src={shown} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="px-2 text-[10px] leading-tight text-gray-500">
              <i className="fas fa-paste block mb-1 text-sm text-gray-400"></i>
              Click, then Ctrl+V
            </span>
          )}

          {busy && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <i className="fas fa-spinner fa-spin text-primary-600"></i>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || busy}
            className="text-xs text-primary-600 hover:underline text-left disabled:opacity-50"
          >
            <i className="fas fa-upload mr-1 text-[10px]"></i>Upload a file
          </button>

          {shown && (
            <button
              type="button"
              onClick={remove}
              disabled={disabled || busy}
              className="text-xs text-red-600 hover:underline text-left disabled:opacity-50"
            >
              <i className="fas fa-times mr-1 text-[10px]"></i>Remove
            </button>
          )}

          <span className="text-[10px] text-gray-400 max-w-[10rem]">
            Paste, drop, or upload. {!supply?._id && 'Saved when you save the item.'}
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = ''; // let the same file be re-picked after a remove
          }}
        />
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default SupplyPhoto;
