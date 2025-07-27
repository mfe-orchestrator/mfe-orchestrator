interface ApiResponseDTO<T> {
    success: boolean;
    data: T;
}

export default ApiResponseDTO;