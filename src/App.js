import React, { useState } from 'react';
import './App.css';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function App() {
  const [keyword, setKeyword] = useState('');
  const [minViews, setMinViews] = useState('');
  const [maxSubscribers, setMaxSubscribers] = useState('');
  const [sortOrder, setSortOrder] = useState('조회수');
  const [resultCount, setResultCount] = useState('50~100개에서 조회');
  const [videoLength, setVideoLength] = useState('전체');
  const [showApiKey, setShowApiKey] = useState(false);

  const apiKey = 'AIzaSyDDKnxy-ojxqOtAavyhOhXYU6CHSwbxupY';

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!keyword.trim()) {
      alert('검색 키워드를 입력하세요');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);

    try {
      /* 1️⃣ search.list (영상 ID 수집) */
      const maxResults =
          resultCount === '100~200개에서 조회' ? 100 : 50; // 50개 or 100개
      const publishedAfter =
          document.getElementById('uploadPeriod').value === 'day'
              ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
              : document.getElementById('uploadPeriod').value === 'week'
                  ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                  : document.getElementById('uploadPeriod').value === 'month'
                      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
                      : null;

      let searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&part=snippet&type=video&q=${encodeURIComponent(
          keyword
      )}&maxResults=${maxResults}`;

      if (publishedAfter) searchUrl += `&publishedAfter=${publishedAfter}`;
      if (videoLength === '쇼츠') searchUrl += `&videoDuration=short`;
      if (videoLength === '롱폼') searchUrl += `&videoDuration=long`;

      const searchRes = await fetch(searchUrl).then((r) => r.json());
      if (!searchRes.items) throw new Error('search.list 실패');

      const videoIds = searchRes.items.map((it) => it.id.videoId).join(',');

      /* 2️⃣ videos.list (조회수·채널 ID) */
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&part=snippet,statistics&id=${videoIds}`;
      const videosRes = await fetch(videosUrl).then((r) => r.json());
      const vids = videosRes.items;

      /* 3️⃣ channels.list (채널 구독자 수) */
      const channelIds = vids.map((v) => v.snippet.channelId).join(',');
      const chUrl = `https://www.googleapis.com/youtube/v3/channels?key=${apiKey}&part=statistics&id=${channelIds}`;
      const chRes = await fetch(chUrl).then((r) => r.json());

      const channelMap = {};
      chRes.items.forEach(
          (c) => (channelMap[c.id] = Number(c.statistics.subscriberCount || 0))
      );

      console.log(vids);

      /* 4️⃣ 합치고 필터링 */
      let rows = vids.map((v) => ({
        id: v.id,
        publishedAt: v.snippet.publishedAt.slice(0, 10),
        title: v.snippet.title,
        viewCount: Number(v.statistics.viewCount || 0),
        channelTitle: v.snippet.channelTitle,
        subscriberCount: channelMap[v.snippet.channelId] || 0,
        channelId: v.snippet.channelId,
      }));

      if (minViews) {
        const mv = Number(minViews);
        rows = rows.filter((r) => r.viewCount >= mv);
      }
      if (maxSubscribers) {
        const ms = Number(maxSubscribers);
        rows = rows.filter((r) => r.subscriberCount <= ms);
      }

      /* 5️⃣ 정렬 */
      rows.sort((a, b) =>
          sortOrder === '조회수'
              ? b.viewCount - a.viewCount
              : new Date(b.publishedAt) - new Date(a.publishedAt)
      );

      setResults(rows);
    } catch (e) {
      console.error(e);
      setError('API 호출 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (id) => {
    setResults((prev) =>
        prev.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
        )
    );
  };

  const openAllLinks = (urls) => {
    for (let i = 0; i < urls.length; i++) {
      const newWin = window.open(urls[i], '_blank');
      if (!newWin) {
        alert("팝업 차단이 되어 있는 것 같습니다.\n브라우저 설정을 확인해주세요.");
        break;
      }
    }
  };

  const selected = results.filter((r) => r.checked);

  const openChannelLinks = () => {
    const urls = selected.map((r) => `https://www.youtube.com/channel/${r.channelId}`);
    openAllLinks(urls);
  };

  const openVideoLinks = () => {
    const urls = selected.map((r) => `https://www.youtube.com/watch?v=${r.id}`);
    openAllLinks(urls);
  };

  const sanitizeFilename = (name) => name.replace(/[\\\\/:*?"<>|]/g, '_');

  const downloadThumbnailsAsZip = async () => {
    const zip = new JSZip();

    for (const r of selected) {
      const url = `https://img.youtube.com/vi/${r.id}/hqdefault.jpg`;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const filename = sanitizeFilename(`${r.title}.jpg`);
        zip.file(filename, blob);
      } catch (e) {
        console.error(`다운로드 실패: ${r.title}`, e);
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, '썸네일_모음.zip');
  };

  const downloadExcel = async () => {
    const { utils, writeFile } = await import('xlsx');
    const rows = selected.map((r) => ({
      업로드날짜: r.publishedAt,
      조회수: r.viewCount,
      제목: r.title,
      채널명: r.channelTitle,
      구독자수: r.subscriberCount,
      영상URL: `https://www.youtube.com/watch?v=${r.id}`,
      채널URL: `https://www.youtube.com/channel/${r.channelId}`,
    }));

    const wb = utils.book_new();
    const ws = utils.json_to_sheet(rows);
    utils.book_append_sheet(wb, ws, '선택영상');
    writeFile(wb, 'youtube_selected.xlsx');
  };

  return (
      <div className="app-container">
        <h2>YouTube DeepSearch</h2>

        <div className="search-form">
          <div className="form-group">
            <label htmlFor="apiKey">API Key</label>
            <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                readOnly
            />
            <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title={showApiKey ? '숨기기' : '보이기'}
            >
              {showApiKey ? '🙈' : '👁️'}
            </button>
          </div>

          <div className="row">
            <div className="form-group">
              <label htmlFor="keyword">검색 키워드</label>
              <input
                  id="keyword"
                  type="text"
                  value={keyword}
                  placeholder="검색할 키워드를 입력하세요"
                  onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxSubscribers">최대 구독자 수</label>
              <input
                  id="maxSubscribers"
                  type="text"
                  value={maxSubscribers}
                  onChange={(e) => setMaxSubscribers(e.target.value)}
                  placeholder="예: 10000"
              />
            </div>
          </div>

          <div className="row">
            <div className="form-group">
              <label htmlFor="minViews">최소 조회수</label>
              <input
                  id="minViews"
                  type="text"
                  value={minViews}
                  onChange={(e) => setMinViews(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="sortOrder">정렬 방식</label>
              <select
                  id="sortOrder"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
              >
                <option value="조회수">조회수</option>
                <option value="업로드 날짜">업로드 날짜</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div className="form-group">
              <label htmlFor="uploadPeriod">업로드 기간</label>
              <select id="uploadPeriod">
                <option value="">전체 기간</option>
                <option value="day">1일</option>
                <option value="week">1주</option>
                <option value="month">1개월</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="resultCount">검색 결과 개수</label>
              <select
                  id="resultCount"
                  value={resultCount}
                  onChange={(e) => setResultCount(e.target.value)}
              >
                <option value="50~100개에서 조회">50~100개에서 조회</option>
                <option value="100~200개에서 조회">100~200개에서 조회</option>
              </select>
            </div>
          </div>

          <div className="row radio-row">
            <label>동영상 길이:</label>
            <label><input type="radio" value="전체" checked={videoLength === '전체'}
                          onChange={() => setVideoLength('전체')}/> 전체</label>
            <label><input type="radio" value="쇼츠" checked={videoLength === '쇼츠'}
                          onChange={() => setVideoLength('쇼츠')}/> 쇼츠</label>
            <label><input type="radio" value="롱폼" checked={videoLength === '롱폼'}
                          onChange={() => setVideoLength('롱폼')}/> 롱폼</label>
          </div>

          <button className="search-btn" onClick={handleSearch}>
            {loading ? '검색 중...' : '검색'}
          </button>
        </div>

        <div className="results-section">
          {error && <p style={{color: 'red'}}>{error}</p>}
          <p>
            결과 리스트 총 <strong>{results.length}</strong>개
          </p>

          <table>
            <thead>
            <tr>
              <th>선택</th>
              <th>업로드 날짜</th>
              <th>조회수</th>
              <th>제목</th>
              <th>채널명</th>
              <th>구독자수</th>
            </tr>
            </thead>
            <tbody>
            {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={() => toggleCheck(r.id)}
                    />
                  </td>
                  <td>{r.publishedAt}</td>
                  <td>{r.viewCount.toLocaleString()}</td>
                  <td>{r.title}</td>
                  <td>{r.channelTitle}</td>
                  <td>{r.subscriberCount.toLocaleString()}</td>
                </tr>
            ))}
            </tbody>
          </table>
          <div className="bottom-buttons">
            <button onClick={() => setResults(results.map((r) => ({...r, checked: true})))}>
              모두 선택
            </button>
            <button onClick={() => setResults(results.map((r) => ({...r, checked: false})))}>
              모두 해제
            </button>
            <button onClick={downloadExcel}>엑셀 추출</button>
            <button onClick={openChannelLinks}>채널 링크 열기</button>
            <button onClick={openVideoLinks}>영상 링크 열기</button>
            <button onClick={downloadThumbnailsAsZip }>썸네일 다운로드</button>
          </div>

        </div>
      </div>
  );
}

export default App;
