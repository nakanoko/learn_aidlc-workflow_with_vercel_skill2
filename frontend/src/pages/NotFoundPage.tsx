import { Link } from 'react-router-dom';
import { Button } from '../components/Button';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="max-w-md mx-auto text-center py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">404</h1>
      <p className="text-gray-700 mb-6">お探しのページが見つかりません。</p>
      <Link to="/">
        <Button variant="primary">一覧へ戻る</Button>
      </Link>
    </div>
  );
}

export default NotFoundPage;
