import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  getActorId,
  getApproverId,
  isValidActorIdFormat,
  setActorId as persistActorId,
  setApproverId as persistApproverId,
} from '../lib/actor';
import { Button } from './Button';
import { toast } from './Toast';
import { Toaster } from './ToastProvider';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps): JSX.Element {
  const [actorInput, setActorInput] = useState<string>('');
  const [approverInput, setApproverInput] = useState<string>('');
  const [actorErr, setActorErr] = useState<string | null>(null);
  const [approverErr, setApproverErr] = useState<string | null>(null);
  const [missingActorBanner, setMissingActorBanner] = useState<boolean>(false);

  useEffect(() => {
    const a = getActorId();
    const p = getApproverId();
    setActorInput(a);
    setApproverInput(p);
    setMissingActorBanner(a === '');
  }, []);

  const handleSaveActor = () => {
    const value = actorInput.trim();
    if (value === '') {
      setActorErr('Actor IDを入力してください');
      return;
    }
    if (!isValidActorIdFormat(value)) {
      setActorErr('英数字 / - / _ で 1-50 文字');
      return;
    }
    persistActorId(value);
    setActorErr(null);
    setMissingActorBanner(false);
    toast.success('Actor IDを更新しました');
  };

  const handleSaveApprover = () => {
    const value = approverInput.trim();
    if (value === '') {
      setApproverErr('Approver IDを入力してください');
      return;
    }
    if (!isValidActorIdFormat(value)) {
      setApproverErr('英数字 / - / _ で 1-50 文字');
      return;
    }
    persistApproverId(value);
    setApproverErr(null);
    toast.success('Approver IDを更新しました');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary-900 text-white h-auto">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <Link to="/" className="text-lg font-semibold tracking-wide hover:underline">
            請求書チェック・承認システム
          </Link>
          <div className="flex flex-col sm:flex-row gap-2 text-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="actor-input" className="whitespace-nowrap">
                Actor:
              </label>
              <input
                id="actor-input"
                type="text"
                value={actorInput}
                onChange={(e) => setActorInput(e.target.value)}
                aria-invalid={actorErr ? true : undefined}
                aria-describedby={actorErr ? 'actor-input-error' : undefined}
                className="rounded-md border border-gray-300 px-2 py-1 text-gray-900 text-sm w-32"
              />
              <Button variant="secondary" onClick={handleSaveActor}>
                保存
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="approver-input" className="whitespace-nowrap">
                Approver:
              </label>
              <input
                id="approver-input"
                type="text"
                value={approverInput}
                onChange={(e) => setApproverInput(e.target.value)}
                aria-invalid={approverErr ? true : undefined}
                aria-describedby={approverErr ? 'approver-input-error' : undefined}
                className="rounded-md border border-gray-300 px-2 py-1 text-gray-900 text-sm w-32"
              />
              <Button variant="secondary" onClick={handleSaveApprover}>
                保存
              </Button>
            </div>
          </div>
        </div>
        {(actorErr || approverErr) && (
          <div className="max-w-screen-xl mx-auto px-4 md:px-8 pb-2 text-xs">
            {actorErr && (
              <p id="actor-input-error" role="alert" className="text-amber-200">
                Actor: {actorErr}
              </p>
            )}
            {approverErr && (
              <p id="approver-input-error" role="alert" className="text-amber-200">
                Approver: {approverErr}
              </p>
            )}
          </div>
        )}
      </header>
      {missingActorBanner && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 md:px-8 py-2"
        >
          Actor IDが未設定です。ヘッダー右上から設定してください。
        </div>
      )}
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 md:px-8 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
