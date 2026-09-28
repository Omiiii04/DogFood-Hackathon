import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useSubmissions = (selectedTrack = 'All', searchQuery = '', sortBy = 'upvotes') => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (selectedTrack && selectedTrack !== 'All') params.track = selectedTrack;
      if (searchQuery) params.search = searchQuery;
      if (sortBy) params.sort = sortBy;

      const res = await api.get('/submissions/gallery', { params });

      // Handle both { success, data: { submissions } } and direct array shapes
      let fetched = [];
      if (res && res.success && res.data) {
        fetched = Array.isArray(res.data.submissions)
          ? res.data.submissions
          : Array.isArray(res.data)
          ? res.data
          : [];
      } else if (Array.isArray(res)) {
        fetched = res;
      }
      setSubmissions(fetched);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTrack, searchQuery, sortBy]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  return { submissions, loading, error, refetch: fetchGallery };
};
