/*
 * d2d_impl.h
 * Объявление классов и структур из заголовочных файлов из SDK 8.1
 */
 
//+-----------------------------------------------------------------------------
//
//  Struct:
//      D2D_VECTOR_4F
//
//------------------------------------------------------------------------------
typedef struct D2D_VECTOR_4F
{
    FLOAT x;
    FLOAT y;
    FLOAT z;
    FLOAT w;

} D2D_VECTOR_4F;

namespace D2D1
{
    COM_DECLSPEC_NOTHROW
        D2D1FORCEINLINE
        D2D1_VECTOR_4F
        Vector4F(
            FLOAT x = 0.0f,
            FLOAT y = 0.0f,
            FLOAT z = 0.0f,
            FLOAT w = 0.0f
        )
    {
        D2D1_VECTOR_4F vec4 = { x, y, z, w };
        return vec4;
    }
}