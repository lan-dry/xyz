type Row = { name: string; type: string; required?: boolean; description: string };

export function ParamTable({ rows }: { rows: Row[] }) {
  return (
    <div className="table-wrap">
      <table className="param-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <code>{r.name}</code>
              </td>
              <td>
                <code>{r.type}</code>
              </td>
              <td>{r.required ? "Yes" : "No"}</td>
              <td>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResponseTable({ rows }: { rows: { status: string; body: string }[] }) {
  return (
    <div className="table-wrap">
      <table className="param-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Body</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status}>
              <td>
                <code>{r.status}</code>
              </td>
              <td>{r.body}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiEndpoint({
  method,
  path,
  auth,
}: {
  method: string;
  path: string;
  auth: string;
}) {
  return (
    <div className="endpoint">
      <span className={`method method-${method.toLowerCase()}`}>{method}</span>
      <code className="endpoint-path">{path}</code>
      <span className="endpoint-auth">{auth}</span>
    </div>
  );
}
