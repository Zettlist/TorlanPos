export default function ProgressBar({ progress, color = 'primary' }) {
    const colorClasses = {
        primary: 'to-primary-400',
        accent: 'from-accent-500 ',
        emerald: 'from-emerald-500 to-emerald-400',
        amber: 'from-amber-500 to-amber-400'
    };

    return (
        <div className="progress-bar">
            <div
                className={`progress-fill bg-gradient-to-r ${colorClasses[color] || colorClasses.primary}`}
                style={{ width: `${Math.min(progress, 100)}%` }}
            />
        </div>
    );
}
