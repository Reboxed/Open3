import { SVGAttributes } from "react";

interface StarSvgProps {
    highlighted: boolean;
    props?: SVGAttributes<SVGSVGElement>;
}

export default function StarSvg({ highlighted, props }: StarSvgProps) {
    return (
        highlighted ? (
            <svg width="18" height="18" {...props} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 1L10.7961 6.52786H16.6085L11.9062 9.94427L13.7023 15.4721L9 12.0557L4.29772 15.4721L6.09383 9.94427L1.39155 6.52786H7.20389L9 1Z" fill="white" />
            </svg>
        ) : (
            <svg width="18" height="18" {...props} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.2021 6.7207L10.3418 7.15332H14.6846L11.5391 9.43848L11.1719 9.70508L11.3115 10.1377L12.5127 13.835L9.36719 11.5498L9 11.2832L8.63281 11.5498L5.48633 13.835L6.68848 10.1377L6.82812 9.70508L6.46094 9.43848L3.31543 7.15332H7.6582L7.79785 6.7207L9 3.02246L10.2021 6.7207Z" stroke="white" strokeWidth="1.25" />
            </svg>
        )
    )
}
