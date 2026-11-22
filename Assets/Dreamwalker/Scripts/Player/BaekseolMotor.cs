using Dreamwalker.Input;
using UnityEngine;

namespace Dreamwalker.Player
{
    [RequireComponent(typeof(Rigidbody2D), typeof(CapsuleCollider2D))]
    public sealed class BaekseolMotor : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField, Min(.1f)] private float runSpeed = 6.8f;
        [SerializeField, Min(.1f)] private float jumpSpeed = 11.5f;
        [SerializeField, Min(.1f)] private float dashSpeed = 14.5f;
        [SerializeField, Min(.01f)] private float dashDuration = .13f;
        [SerializeField, Min(0f)] private float dashCooldown = .36f;
        [SerializeField] private Transform visualRoot;

        private Rigidbody2D body;
        private CapsuleCollider2D capsule;
        private float horizontal;
        private float virtualHorizontal;
        private float dashRemaining;
        private float dashCooldownRemaining;
        private float coyoteRemaining;
        private float jumpBufferRemaining;
        private float previousX;
        private int facing = 1;
        private bool requestJump, requestDash;

        public int Facing => facing;
        public bool IsDashing => dashRemaining > 0;
        public Rigidbody2D Body => body;

        private void Awake()
        {
            body = GetComponent<Rigidbody2D>();
            capsule = GetComponent<CapsuleCollider2D>();
            body.freezeRotation = true;
            body.gravityScale = 2.7f;
            body.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            previousX = transform.position.x;
        }

        public void ApplyStudioMovement(float run, float jump, float dash, float duration)
        {
            runSpeed = run;
            jumpSpeed = jump;
            dashSpeed = dash;
            dashDuration = duration;
        }

        public void SetVisualRoot(Transform value) => visualRoot = value;
        public void SetVirtualHorizontal(float x) => virtualHorizontal = Mathf.Clamp(x, -1f, 1f);
        public void RequestJump() => requestJump = true;
        public void RequestDash() => requestDash = true;

        private void Update()
        {
            float keyboard = DreamwalkerInput.Horizontal;
            horizontal = Mathf.Abs(virtualHorizontal) > .05f ? virtualHorizontal : keyboard;

            if (DreamwalkerInput.JumpPressed() || requestJump) jumpBufferRemaining = .12f;
            if (DreamwalkerInput.DashPressed() || requestDash)
            {
                if (dashCooldownRemaining <= 0f && dashRemaining <= 0f)
                {
                    dashRemaining = dashDuration;
                    dashCooldownRemaining = dashCooldown;
                }
            }

            requestJump = requestDash = false;
            dashCooldownRemaining = Mathf.Max(0f, dashCooldownRemaining - Time.deltaTime);
            jumpBufferRemaining = Mathf.Max(0f, jumpBufferRemaining - Time.deltaTime);
            coyoteRemaining = IsGrounded() ? .11f : Mathf.Max(0f, coyoteRemaining - Time.deltaTime);

            if (Mathf.Abs(horizontal) > .1f)
            {
                facing = horizontal > 0f ? 1 : -1;
                if (visualRoot != null)
                {
                    Vector3 local = visualRoot.localScale;
                    local.x = Mathf.Abs(local.x) * facing;
                    visualRoot.localScale = local;
                }
            }

            if (jumpBufferRemaining > 0f && coyoteRemaining > 0f)
            {
                Vector2 speed = body.linearVelocity;
                speed.y = jumpSpeed;
                body.linearVelocity = speed;
                jumpBufferRemaining = coyoteRemaining = 0f;
            }
        }

        private void FixedUpdate()
        {
            Vector2 speed = body.linearVelocity;
            if (dashRemaining > 0f)
            {
                speed.x = facing * dashSpeed;
                speed.y = Mathf.Max(speed.y, 0f);
                dashRemaining = Mathf.Max(0f, dashRemaining - Time.fixedDeltaTime);
            }
            else speed.x = horizontal * runSpeed;
            body.linearVelocity = speed;
        }

        private bool IsGrounded()
        {
            // Starts just below the player's capsule to avoid detecting the
            // player's own collider. No special Ground layer is required.
            Bounds b = capsule.bounds;
            Vector2 start = new Vector2(b.center.x, b.min.y - .02f);
            RaycastHit2D[] hits = Physics2D.RaycastAll(start, Vector2.down, .13f);
            foreach (RaycastHit2D hit in hits)
                if (hit.collider != capsule && !hit.collider.isTrigger && hit.normal.y > .55f)
                    return true;
            return false;
        }
    }
}
